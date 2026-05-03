import { getOrderPlanDisplayStatus } from "@/libs/order-plans";

const getLegacyPreorderPaymentBadgeLabel = (preorder = {}) => {
  if (preorder.payment?.provider === "razorpay") {
    return preorder.payment?.status === "paid"
      ? "payment: paid via Razorpay"
      : "payment: Razorpay";
  }

  return "payment: manual";
};

export const getLegacyPreorderConfirmationLabel = (preorder = {}) => {
  const isPickup = preorder.fulfillmentMethod === "pickup";

  if (preorder.payment?.provider === "razorpay") {
    if (preorder.status === "fulfilled") {
      return isPickup ? "Paid and picked up" : "Paid and delivered";
    }

    if (preorder.status === "shipped") {
      return isPickup ? "Paid and ready for pickup" : "Paid and shipped";
    }

    return "Paid and confirmed";
  }

  if (preorder.status === "fulfilled") {
    return isPickup ? "Picked up" : "Delivered";
  }

  if (preorder.status === "shipped") {
    return isPickup ? "Ready for pickup" : "Shipped";
  }

  return preorder.status === "confirmed" ? "Confirmed" : "Awaiting contact";
};

export const getOrderPlanSelectionSummary = (plan = {}) => {
  const items = Array.isArray(plan.items) ? plan.items : [];

  if (items.length > 0) {
    return items.map((item) => `${item.productName} x ${item.quantity}`).join(", ");
  }

  if (plan.selectionMode === "combo") {
    return plan.comboName || "Combo";
  }

  return "Custom lineup";
};

export const normalizeAdminOrderFromOrderPlan = (plan = {}) => {
  const status = getOrderPlanDisplayStatus({
    mode: plan.mode,
    status: plan.status,
  });

  return {
    id: plan.id,
    sourceType: "order_plan",
    sourceLabel: "unified order",
    customerName: plan.name || "",
    email: plan.email || "",
    phone: plan.phone || "",
    createdAt: plan.createdAt || null,
    status,
    currency: plan.currency || "INR",
    items: Array.isArray(plan.items) ? plan.items : [],
    totalQuantity: Number(plan.totalQuantity || 0),
    subtotal: Number(plan.subtotal || 0),
    deliveryFee: Number(plan.deliveryFee || 0),
    deliveryDistanceKm: Number(plan.deliveryDistanceKm || 0),
    total: Number(plan.total || 0),
    address: plan.address || "",
    normalizedDeliveryAddress: plan.normalizedDeliveryAddress || "",
    deliveredAt: plan.deliveredAt || null,
    shippedAt: plan.shipment?.shippedAt || null,
    trackingLink: plan.shipment?.trackingLink || "",
    estimatedArrivalAt: plan.shipment?.estimatedArrivalAt || null,
    payment: plan.payment || {},
    paymentBadgeLabel: `payment: ${plan.payment?.status || "-"}`,
    mode: plan.mode || "one_time",
    cadence: plan.cadence || "",
    durationWeeks: Number(plan.durationWeeks || 0),
    firstDeliveryDate: plan.firstDeliveryDate || plan.startDate || "",
    nextDeliveryDate: plan.nextDeliveryDate || "",
    startDate: plan.startDate || "",
    selectionSummary: getOrderPlanSelectionSummary(plan),
    fulfillmentMethod: "delivery",
    pickupAddressSnapshot: "",
    preorderWindowLabel: "",
    discount: null,
    confirmationLabel: "",
  };
};

export const normalizeAdminOrderFromLegacyPreorder = (preorder = {}) => ({
  id: preorder.id,
  sourceType: "legacy_preorder",
  sourceLabel: "legacy preorder",
  customerName: preorder.customerName || "",
  email: preorder.email || "",
  phone: preorder.phone || "",
  createdAt: preorder.createdAt || null,
  status: String(preorder.status || "").trim(),
  currency: preorder.currency || "INR",
  items: Array.isArray(preorder.items) ? preorder.items : [],
  totalQuantity: Number(preorder.totalQuantity || 0),
  subtotal: Number(preorder.subtotal || 0),
  deliveryFee: Number(preorder.deliveryFee || 0),
  deliveryDistanceKm: Number(preorder.deliveryDistanceKm || 0),
  total: Number(preorder.total || preorder.subtotal || 0),
  address: preorder.address || "",
  normalizedDeliveryAddress: preorder.normalizedDeliveryAddress || "",
  deliveredAt: preorder.deliveredAt || null,
  shippedAt: preorder.shipment?.shippedAt || null,
  trackingLink: preorder.shipment?.trackingLink || "",
  estimatedArrivalAt: preorder.shipment?.estimatedArrivalAt || null,
  payment: preorder.payment || {},
  paymentBadgeLabel: getLegacyPreorderPaymentBadgeLabel(preorder),
  mode: "one_time",
  cadence: "",
  durationWeeks: 0,
  firstDeliveryDate: preorder.deliveryDate || null,
  nextDeliveryDate: preorder.deliveryDate || null,
  startDate: "",
  selectionSummary: preorder.preorderWindowLabel || "Legacy preorder",
  fulfillmentMethod: preorder.fulfillmentMethod || "delivery",
  pickupAddressSnapshot: preorder.pickupAddressSnapshot || "",
  preorderWindowLabel: preorder.preorderWindowLabel || "",
  discount: preorder.discount || {},
  confirmationLabel: getLegacyPreorderConfirmationLabel(preorder),
});

export const sortAdminOrdersByCreatedAtDesc = (orders = []) =>
  [...orders].sort(
    (left, right) =>
      new Date(right.createdAt || 0).getTime() -
      new Date(left.createdAt || 0).getTime()
  );
