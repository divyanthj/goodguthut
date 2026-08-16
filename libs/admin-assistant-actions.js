import { syncCollatoKnowledgeDocument } from "@/libs/collato-knowledge";
import { calculateSmallCartFee } from "@/libs/cart-fee";
import {
  isRecurringOrderPlanPaymentConfirmed,
  normalizeOneTimeOrderPlanStatus,
} from "@/libs/order-plans";
import { recalculatePreorderWindowRouteSnapshot } from "@/libs/preorder-route-planner";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";
import { reserveNextOrderNumber } from "@/libs/order-numbers";
import { MAX_TOTAL_QTY } from "@/libs/order-quantity";
import { createAndSendOrderPlanInvoice, createAndSendPreorderInvoice } from "@/libs/invoices";
import { listPlannedSubscriptionDeliveryDates } from "@/libs/subscription-schedule";
import {
  isValidAddress,
  isValidEmail,
  isValidName,
  isValidPhone,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "@/libs/request-protection";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import Sku from "@/models/Sku";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (value) => new RegExp(`^${escapeRegExp(String(value || "").trim())}$`, "i");

export class AssistantActionError extends Error {
  constructor(message, code = "invalid_action") {
    super(message);
    this.code = code;
  }
}

const assertExpectedStatus = (record, proposal) => {
  const currentStatus = String(record.status || "").toLowerCase();
  if (currentStatus !== proposal.expectedStatus) {
    throw new AssistantActionError(
      `This record changed after the action was proposed. It is now ${currentStatus}, not ${proposal.expectedStatus}.`,
      "stale_action"
    );
  }
  return currentStatus;
};

const updatePreorderStatus = async (proposal) => {
  const preorder = await Preorder.findOne({ orderNumber: exact(proposal.target) });
  if (!preorder) throw new AssistantActionError(`Preorder ${proposal.target} was not found.`, "not_found");
  const previousStatus = assertExpectedStatus(preorder, proposal);
  const allowed = new Set(["confirmed", "shipped", "delivered", "cancelled"]);
  if (!allowed.has(proposal.requestedStatus)) throw new AssistantActionError("Unsupported preorder status.");
  if (["fulfilled", "cancelled"].includes(previousStatus) && proposal.requestedStatus !== previousStatus) {
    throw new AssistantActionError(`A ${previousStatus} preorder cannot be changed by the assistant.`);
  }

  if (proposal.requestedStatus === "delivered") {
    if (!["confirmed", "shipped"].includes(previousStatus)) {
      throw new AssistantActionError("Only a confirmed or shipped preorder can be marked delivered.");
    }
    preorder.deliveredAt = new Date();
    preorder.status = "fulfilled";
  } else if (proposal.requestedStatus === "shipped") {
    const now = new Date();
    preorder.shipment = {
      ...(preorder.shipment?.toObject?.() || preorder.shipment || {}),
      shippedAt: now,
      estimatedArrivalAt: preorder.fulfillmentMethod === "pickup" ? null : new Date(now.getTime() + 60 * 60 * 1000),
    };
  }
  if (proposal.requestedStatus !== "delivered") preorder.status = proposal.requestedStatus;
  await preorder.save();
  if (preorder.preorderWindow) {
    await recalculatePreorderWindowRouteSnapshot({ preorderWindowId: preorder.preorderWindow }).catch((error) =>
      console.error("Assistant route snapshot refresh failed", error)
    );
  }
  await syncCollatoKnowledgeDocument({
    sourceType: "preorder",
    id: preorder.id,
    title: `Preorder ${preorder.orderNumber || preorder.customerName || preorder.id}`,
    data: preorder,
  });
  let invoiceDelivery = null;
  if (proposal.requestedStatus === "delivered") {
    invoiceDelivery = await createAndSendPreorderInvoice({ preorder, sendEmail: false });
    if (invoiceDelivery.invoice) {
      await syncCollatoKnowledgeDocument({
        sourceType: "invoice",
        id: invoiceDelivery.invoice.id,
        title: `Invoice ${invoiceDelivery.invoice.invoiceNumber || invoiceDelivery.invoice.id}`,
        data: invoiceDelivery.invoice,
      });
    }
  }
  return {
    target: preorder.orderNumber,
    previousStatus,
    newStatus: preorder.status,
    delivered: proposal.requestedStatus === "delivered",
    invoiceCreated: Boolean(invoiceDelivery?.created),
    notificationSent: false,
  };
};

const getNextRecurringDeliveryDate = (orderPlan) => {
  const currentDeliveryDate = String(
    orderPlan.nextDeliveryDate || orderPlan.firstDeliveryDate || orderPlan.startDate || ""
  ).trim();
  return listPlannedSubscriptionDeliveryDates({
    startDate: orderPlan.firstDeliveryDate || orderPlan.startDate,
    cadence: orderPlan.cadence,
    totalCount: orderPlan.payment?.totalCount || 0,
  }).find((dateKey) => dateKey > currentDeliveryDate) || "";
};

const updateOrderPlanStatus = async (proposal) => {
  const orderPlan = await OrderPlan.findOne({ orderNumber: exact(proposal.target) });
  if (!orderPlan) throw new AssistantActionError(`Order ${proposal.target} was not found.`, "not_found");
  const previousStatus = assertExpectedStatus(orderPlan, proposal);
  const nextStatus = proposal.requestedStatus;

  if (orderPlan.mode === "one_time") {
    if (!["confirmed", "shipped", "delivered", "cancelled"].includes(nextStatus)) {
      throw new AssistantActionError("That status is not supported for a one-time order.");
    }
    if (nextStatus === "shipped" && normalizeOneTimeOrderPlanStatus(previousStatus) !== "confirmed") {
      throw new AssistantActionError("Only a confirmed one-time order can be marked shipped.");
    }
    if (nextStatus === "delivered" && !["confirmed", "shipped"].includes(normalizeOneTimeOrderPlanStatus(previousStatus))) {
      throw new AssistantActionError("Only a confirmed or shipped one-time order can be marked delivered.");
    }
  } else {
    if (!["active", "paused", "shipped", "delivered", "cancelled"].includes(nextStatus)) {
      throw new AssistantActionError("That status is not supported for a recurring order.");
    }
    if (
      nextStatus === "shipped" &&
      (!new Set(["new", "active"]).has(previousStatus) || !isRecurringOrderPlanPaymentConfirmed(orderPlan.payment))
    ) {
      throw new AssistantActionError("Only a paid, active recurring order can be marked shipped.");
    }
    if (
      nextStatus === "delivered" &&
      (!new Set(["new", "active", "shipped"]).has(previousStatus) || !isRecurringOrderPlanPaymentConfirmed(orderPlan.payment))
    ) {
      throw new AssistantActionError("Only a paid, active or shipped recurring order can be marked delivered.");
    }
  }

  if (["fulfilled", "cancelled"].includes(previousStatus) && nextStatus !== previousStatus) {
    throw new AssistantActionError(`A ${previousStatus} order cannot be changed by the assistant.`);
  }
  let invoiceDelivery = null;
  if (nextStatus === "delivered") {
    const deliveryDate = String(
      orderPlan.nextDeliveryDate || orderPlan.firstDeliveryDate || orderPlan.startDate || ""
    ).trim();
    orderPlan.deliveredAt = new Date();
    if (orderPlan.mode === "one_time") {
      orderPlan.status = "fulfilled";
    } else {
      const nextDeliveryDate = getNextRecurringDeliveryDate(orderPlan);
      orderPlan.nextDeliveryDate = nextDeliveryDate;
      orderPlan.status = nextDeliveryDate ? "active" : "fulfilled";
    }
    await orderPlan.save();
    invoiceDelivery = await createAndSendOrderPlanInvoice({
      orderPlan,
      deliveryDate,
      sendEmail: false,
    });
  } else if (nextStatus === "shipped") {
    const now = new Date();
    orderPlan.shipment = {
      ...(orderPlan.shipment?.toObject?.() || orderPlan.shipment || {}),
      shippedAt: now,
      estimatedArrivalAt: new Date(now.getTime() + 60 * 60 * 1000),
    };
  }
  if (nextStatus !== "delivered") {
    orderPlan.status = nextStatus;
    await orderPlan.save();
  }
  await recalculateSubscriptionRouteSnapshots().catch((error) =>
    console.error("Assistant subscription route refresh failed", error)
  );
  await syncCollatoKnowledgeDocument({
    sourceType: "order_plan",
    id: orderPlan.id,
    title: `Order plan ${orderPlan.orderNumber || orderPlan.name || orderPlan.id}`,
    data: orderPlan,
  });
  if (invoiceDelivery?.invoice) {
    await syncCollatoKnowledgeDocument({
      sourceType: "invoice",
      id: invoiceDelivery.invoice.id,
      title: `Invoice ${invoiceDelivery.invoice.invoiceNumber || invoiceDelivery.invoice.id}`,
      data: invoiceDelivery.invoice,
    });
  }
  return {
    target: orderPlan.orderNumber,
    previousStatus,
    newStatus: orderPlan.status,
    delivered: nextStatus === "delivered",
    invoiceCreated: Boolean(invoiceDelivery?.created),
    notificationSent: false,
  };
};

const updateSkuStatus = async (proposal) => {
  const sku = await Sku.findOne({ sku: exact(proposal.target) });
  if (!sku) throw new AssistantActionError(`SKU ${proposal.target} was not found.`, "not_found");
  const previousStatus = assertExpectedStatus(sku, proposal);
  if (!["active", "archived"].includes(proposal.requestedStatus)) {
    throw new AssistantActionError("Unsupported SKU status.");
  }
  sku.status = proposal.requestedStatus;
  await sku.save();
  await syncCollatoKnowledgeDocument({
    sourceType: "sku",
    id: sku.id,
    title: `SKU ${sku.sku || sku.name}`,
    data: sku,
  });
  return { target: sku.sku, previousStatus, newStatus: sku.status };
};

const createManualOrder = async (proposal, context = {}) => {
  const name = normalizeName(proposal.customerName || "");
  const phone = normalizePhone(proposal.phone || "");
  const email = normalizeEmail(proposal.email || "");
  const address = normalizeAddress(proposal.address || "");
  const deliveryDate = String(proposal.deliveryDate || "").trim();
  const orderKind = proposal.orderKind === "sample" ? "sample" : "manual";
  if (!isValidName(name)) throw new AssistantActionError("Enter a valid recipient name.");
  if ((orderKind === "manual" || phone) && !isValidPhone(phone)) throw new AssistantActionError("Enter a valid phone number.");
  if (email && !isValidEmail(email)) throw new AssistantActionError("Enter a valid email address or leave it blank.");
  if ((orderKind === "manual" || address) && !isValidAddress(address)) throw new AssistantActionError("Enter a valid delivery address.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(new Date(`${deliveryDate}T12:00:00+05:30`).getTime())) {
    throw new AssistantActionError("Enter a valid delivery date in YYYY-MM-DD format.");
  }

  const quantityBySku = new Map();
  for (const item of Array.isArray(proposal.items) ? proposal.items : []) {
    const sku = String(item?.sku || "").trim().toUpperCase();
    const quantity = Math.round(Number(item?.quantity || 0));
    if (!sku || quantity < 1 || quantity > 10) {
      throw new AssistantActionError("Each order item needs an exact SKU and a quantity from 1 to 10.");
    }
    quantityBySku.set(sku, (quantityBySku.get(sku) || 0) + quantity);
  }
  if (!quantityBySku.size || quantityBySku.size > 12) {
    throw new AssistantActionError("Add between 1 and 12 distinct products.");
  }
  const totalQuantity = [...quantityBySku.values()].reduce((sum, quantity) => sum + quantity, 0);
  if (totalQuantity > MAX_TOTAL_QTY) {
    throw new AssistantActionError(`Orders cannot include more than ${MAX_TOTAL_QTY} items.`);
  }
  if ([...quantityBySku.values()].some((quantity) => quantity > 10)) {
    throw new AssistantActionError("A single SKU cannot exceed 10 units.");
  }

  const skuCodes = [...quantityBySku.keys()];
  const skuDocs = await Sku.find({ sku: { $in: skuCodes }, status: "active" });
  const skuMap = new Map(skuDocs.map((sku) => [sku.sku, sku]));
  const missingSku = skuCodes.find((sku) => !skuMap.has(sku));
  if (missingSku) throw new AssistantActionError(`SKU ${missingSku} is not active or does not exist.`);
  const items = skuCodes.map((skuCode) => {
    const sku = skuMap.get(skuCode);
    const quantity = quantityBySku.get(skuCode);
    const unitPrice = Math.max(0, Number(sku.unitPrice || 0));
    return { sku: skuCode, productName: sku.name, quantity, unitPrice, lineTotal: unitPrice * quantity };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const smallCartFee = calculateSmallCartFee(totalQuantity);
  const total = subtotal + smallCartFee;
  const paymentHandling = orderKind === "sample" ? "never_collect" : proposal.paymentHandling;
  if (!["mark_paid", "collect_later", "never_collect"].includes(paymentHandling)) {
    throw new AssistantActionError("Choose whether payment is paid, collect later, or not required.");
  }

  const orderPlan = await OrderPlan.create({
    orderNumber: await reserveNextOrderNumber({ sourceType: "order_plan", mode: "one_time" }),
    mode: "one_time",
    paymentType: "one_time",
    name,
    phone,
    email,
    address,
    normalizedDeliveryAddress: address,
    cadence: "",
    durationWeeks: 0,
    selectionMode: "custom",
    deliveryDaysOfWeek: [],
    minimumLeadDays: 0,
    startDate: deliveryDate,
    firstDeliveryDate: deliveryDate,
    nextDeliveryDate: deliveryDate,
    currency: "INR",
    items,
    totalQuantity,
    subtotal,
    discount: { code: "", amount: 0, discountAmount: 0, subtotalAfterDiscount: subtotal },
    deliveryFee: 0,
    deliveryFeeBeforePerks: 0,
    smallCartFee,
    deliveryDistanceKm: 0,
    total,
    source: "admin",
    adminOrderKind: orderKind,
    createdByAdmin: String(context.adminEmail || "").trim().toLowerCase(),
    status: "confirmed",
    payment: paymentHandling === "mark_paid"
      ? { provider: "manual", status: "paid", amount: total, currency: "INR", paymentId: `manual_${Date.now()}`, paidAt: new Date() }
      : paymentHandling === "collect_later"
        ? { provider: "manual", status: "pending", amount: total, currency: "INR" }
        : { provider: "manual", status: "not_required", amount: 0, currency: "INR" },
  });
  await recalculateSubscriptionRouteSnapshots().catch((error) =>
    console.error("Assistant manual order route refresh failed", error)
  );
  await syncCollatoKnowledgeDocument({
    sourceType: "order_plan",
    id: orderPlan.id,
    title: `Order plan ${orderPlan.orderNumber}`,
    data: orderPlan,
  });
  return {
    target: orderPlan.orderNumber,
    orderNumber: orderPlan.orderNumber,
    orderKind,
    status: orderPlan.status,
    paymentStatus: orderPlan.payment.status,
    total: orderPlan.total,
    currency: orderPlan.currency,
    notificationSent: false,
  };
};

export async function executeAssistantAction(proposal, context = {}) {
  if (proposal.type === "create_manual_order") return createManualOrder(proposal, context);
  if (proposal.type === "update_preorder_status") return updatePreorderStatus(proposal);
  if (proposal.type === "update_order_plan_status") return updateOrderPlanStatus(proposal);
  if (proposal.type === "update_sku_status") return updateSkuStatus(proposal);
  throw new AssistantActionError("This action type is not supported.");
}

export const summarizeAssistantActionStatus = (actions = []) => {
  if (!actions.length) return "none";
  if (actions.some((action) => ["proposed", "executing"].includes(action.status))) return "proposed";
  const completed = actions.filter((action) => action.status === "completed").length;
  if (completed === actions.length) return "completed";
  if (completed) return "partially_completed";
  if (actions.every((action) => action.status === "cancelled")) return "cancelled";
  return "failed";
};
