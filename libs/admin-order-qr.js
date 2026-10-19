import OrderPlan from "@/models/OrderPlan";
import { createRazorpayQrCode, fetchRazorpayQrCode, fetchRazorpayQrPayments, closeRazorpayQrCode } from "@/libs/razorpay";
import { WEBSITE_INVENTORY_HOLD_MS, commitPaidOrderInventory, releaseOrderInventory } from "@/libs/inventory";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";
import { sendOrderPlanConfirmationEmail } from "@/libs/order-plan-notifications";
import { sendAdminOrderPlanConfirmedEmail } from "@/libs/admin-order-notifications";
import { syncCollatoKnowledgeDocument } from "@/libs/collato-knowledge";

export const isAdminQrOrder = (order) =>
  order?.source === "admin" && ["one_time", "recurring"].includes(order?.mode) &&
  (order?.mode !== "recurring" || order?.paymentType === "one_time") &&
  order?.payment?.provider === "razorpay" && Boolean(order?.payment?.qrCodeId);

export const createAdminOrderQrPayment = async (order) => {
  const amount = Math.round(Number(order.total) * 100);
  if (order.source !== "admin" || !["one_time", "recurring"].includes(order.mode) ||
    (order.mode === "recurring" && order.paymentType !== "one_time") ||
    order.currency !== "INR" || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("QR payments require a positive INR admin order or prepaid subscription.");
  }
  const qr = await createRazorpayQrCode({
    amount,
    name: "Good Gut Hut",
    description: `${order.mode === "recurring" ? "Subscription" : "Order"} ${order.orderNumber}`,
    closeBy: Math.floor((Date.now() + WEBSITE_INVENTORY_HOLD_MS) / 1000),
    notes: { orderPlanId: order.id, orderNumber: order.orderNumber, source: "admin" },
  });
  if (!qr.id || !qr.image_url || qr.status !== "active" || qr.usage !== "single_use" || qr.fixed_amount !== true ||
    qr.type !== "upi_qr" || Number(qr.payment_amount) !== amount || !Number.isFinite(Number(qr.close_by)) || Number(qr.close_by) * 1000 <= Date.now()) {
    if (qr.id) await closeRazorpayQrCode(qr.id).catch(() => {});
    throw new Error("Razorpay did not return a usable payment QR code.");
  }
  order.status = "payment_pending";
  order.payment = {
    provider: "razorpay", status: "pending", amount: order.total, currency: order.currency,
    qrCodeId: qr.id, qrImageUrl: qr.image_url, qrExpiresAt: new Date(Number(qr.close_by) * 1000),
    totalCount: order.mode === "recurring" ? order.durationWeeks : 1,
    paidCount: 0,
    remainingCount: order.mode === "recurring" ? order.durationWeeks : 1,
  };
  if (order.inventory?.status === "held") order.inventory.expiresAt = order.payment.qrExpiresAt;
  try { await order.save(); }
  catch (error) { await closeRazorpayQrCode(qr.id).catch(() => {}); throw error; }
  return order;
};

// Only captured, exact-amount payments returned for this stored QR can settle it.
export const isMatchingQrPayment = (payment, order) =>
  Boolean(payment?.id) && payment.status === "captured" &&
  Number(payment.amount) === Math.round(Number(order.total) * 100) &&
  payment.currency === order.currency;

const refreshRoutes = async () => {
  try { await recalculateSubscriptionRouteSnapshots(); }
  catch (error) { console.error("Failed to refresh QR order delivery routes", error); }
};

const finishPaidOrder = async (order) => {
  const committed = await commitPaidOrderInventory({
    orderPlanId: order.id, actor: { actorType: "system" }, note: "Verified Razorpay QR payment",
  });
  order = committed || order;
  await refreshRoutes();
  for (const [field, claimField, send] of [
    ["confirmationEmailSentAt", "confirmationEmailClaimedAt", sendOrderPlanConfirmationEmail],
    ["adminOrderEmailSentAt", "adminOrderEmailClaimedAt", sendAdminOrderPlanConfirmedEmail],
  ]) {
    if (order.notifications?.[field]) continue;
    const claim = await OrderPlan.findOneAndUpdate({
      _id: order.id,
      [`notifications.${field}`]: null,
      $or: [
        { [`notifications.${claimField}`]: null },
        { [`notifications.${claimField}`]: { $lt: new Date(Date.now() - 5 * 60 * 1000) } },
      ],
    }, { $set: { [`notifications.${claimField}`]: new Date() } }, { new: true });
    if (!claim) continue;
    try {
      await send({ orderPlan: order });
      await OrderPlan.updateOne({ _id: order.id }, { $set: { [`notifications.${field}`]: new Date(), [`notifications.${claimField}`]: null } });
    } catch (error) {
      await OrderPlan.updateOne({ _id: order.id }, { $set: { [`notifications.${claimField}`]: null } });
      console.error("Failed to send QR order confirmation", error);
    }
  }
  await syncCollatoKnowledgeDocument({ sourceType: "order_plan", id: order.id, title: `Order ${order.orderNumber}`, data: order });
  return order;
};

export const syncAdminOrderQrPayment = async (order, { cancel = false } = {}) => {
  if (!isAdminQrOrder(order)) throw new Error("This is not an admin QR order.");
  if (order.payment.status === "paid") {
    // Inventory transitions are idempotent, including retries after a webhook failure.
    if (order.inventory?.status === "held" || !order.notifications?.confirmationEmailSentAt || !order.notifications?.adminOrderEmailSentAt) return finishPaidOrder(order);
    return order;
  }
  let qr = await fetchRazorpayQrCode(order.payment.qrCodeId);
  if (qr.id !== order.payment.qrCodeId) throw new Error("Razorpay returned a different QR code.");
  if (cancel && qr.status === "active") qr = await closeRazorpayQrCode(order.payment.qrCodeId);
  // Fetch after closing as well, so a payment racing with cancellation still wins.
  const payments = await fetchRazorpayQrPayments(order.payment.qrCodeId);
  const paid = payments.find((payment) => isMatchingQrPayment(payment, order));
  if (paid) {
    const updated = await OrderPlan.findOneAndUpdate(
      { _id: order.id, "payment.qrCodeId": qr.id, "payment.status": { $ne: "paid" } },
      { $set: {
        ...(!["cancelled", "shipped", "fulfilled"].includes(order.status) ? { status: order.mode === "recurring" ? "active" : "confirmed" } : {}),
        "payment.status": "paid", "payment.paymentId": paid.id, "payment.orderId": paid.order_id || "",
        "payment.paidAt": new Date(Number(paid.created_at || Math.floor(Date.now() / 1000)) * 1000),
        "payment.paidCount": order.mode === "recurring" ? order.durationWeeks : 1,
        "payment.remainingCount": 0,
      } },
      { new: true }
    );
    const paidOrder = updated || await OrderPlan.findById(order.id);
    if (!paidOrder || paidOrder.payment.status !== "paid") throw new Error("QR payment could not be saved.");
    return finishPaidOrder(paidOrder);
  }
  // Do not free stock when Razorpay reports money received but its payment list is still syncing.
  if (qr.status === "closed" && qr.close_reason !== "paid" && Number(qr.payments_amount_received || 0) === 0 && Number(qr.payments_count_received || 0) === 0) {
    const latest = await OrderPlan.findById(order.id);
    if (latest.payment.status === "paid") return latest;
    if (["cancelled", "expired"].includes(latest.payment.status)) return latest;
    const expired = qr.close_reason !== "on_demand";
    const released = await releaseOrderInventory({
      orderPlanId: order.id, actor: { actorType: "system" }, expired,
      note: expired ? "Razorpay QR expired unpaid" : "Admin cancelled unpaid QR order",
      setOrderStatus: latest.status === "cancelled" || !expired ? "cancelled" : "failed",
      setPaymentStatus: expired ? "expired" : "cancelled",
    });
    await refreshRoutes();
    await syncCollatoKnowledgeDocument({ sourceType: "order_plan", id: order.id, title: `Order ${order.orderNumber}`, data: released });
    return released;
  }
  return order;
};

// Refreshing Orders also reconciles payments made after the QR screen was closed.
export const syncPendingAdminQrOrders = async () => {
  const pending = await OrderPlan.find({
    source: "admin", mode: { $in: ["one_time", "recurring"] }, "payment.provider": "razorpay", "payment.status": "pending", "payment.qrCodeId": { $exists: true, $ne: "" },
  }).sort({ createdAt: -1 }).limit(20);
  for (let offset = 0; offset < pending.length; offset += 5) {
    const results = await Promise.allSettled(pending.slice(offset, offset + 5).map(order => syncAdminOrderQrPayment(order)));
    for (const result of results) if (result.status === "rejected") console.error("Failed to reconcile pending admin QR order", result.reason);
  }
};
