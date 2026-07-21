import { normalizeOneTimeOrderPlanStatus } from "@/libs/order-plans";

const TRACKING_STAGES = [
  {
    key: "received",
    label: "Received",
    description: "We have your order details.",
  },
  {
    key: "production",
    label: "In Production",
    description: "Your Good Gut Hut batch is being prepared.",
  },
  {
    key: "dispatched",
    label: "Ready / Dispatched",
    description: "Your order is ready for pickup or on its way.",
  },
  {
    key: "delivered",
    label: "Delivered",
    description: "Your order has been completed.",
  },
];

const STATUS_STAGE_INDEX = {
  pending: 0,
  new: 0,
  payment_pending: 0,
  paid: 1,
  confirmed: 1,
  active: 1,
  shipped: 2,
  fulfilled: 3,
};

const TERMINAL_CANCELLED_STATUSES = new Set(["cancelled", "failed"]);

export const normalizeTrackingOrderNumber = (value = "") =>
  String(value || "").trim().toUpperCase().replace(/\s+/g, "");

export const normalizeTrackingContact = (value = "") =>
  String(value || "").trim().toLowerCase();

export const getContactDigits = (value = "") => String(value || "").replace(/\D/g, "");

export const isValidTrackingOrderNumber = (value = "") =>
  /^[A-Z0-9-]{4,40}$/.test(normalizeTrackingOrderNumber(value));

export const isValidTrackingContact = (value = "") => {
  const normalized = normalizeTrackingContact(value);
  const digits = getContactDigits(normalized);

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return normalized.length <= 160;
  }

  return digits.length >= 7 && digits.length <= 15;
};

export const doesContactMatchOrder = (order = {}, contactInput = "") => {
  const normalizedInput = normalizeTrackingContact(contactInput);
  const inputDigits = getContactDigits(normalizedInput);
  const email = normalizeTrackingContact(order.email || "");
  const phoneDigits = getContactDigits(order.phone || "");

  if (email && normalizedInput === email) {
    return true;
  }

  return Boolean(inputDigits && phoneDigits && inputDigits === phoneDigits);
};

const formatDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
};

const getOrderStatus = (order = {}, recordType = "") => {
  if (recordType === "order_plan" && order.mode === "one_time") {
    return normalizeOneTimeOrderPlanStatus(order.status);
  }

  return String(order.status || "").trim();
};

const getStageIndex = ({ order, recordType }) => {
  const status = getOrderStatus(order, recordType);

  if (TERMINAL_CANCELLED_STATUSES.has(status)) {
    return -1;
  }

  if (order.deliveredAt) {
    return 3;
  }

  if (order.shipment?.shippedAt || order.shipment?.trackingLink) {
    return Math.max(2, STATUS_STAGE_INDEX[status] ?? 0);
  }

  return STATUS_STAGE_INDEX[status] ?? 0;
};

const getStageDate = ({ order, stageKey }) => {
  if (stageKey === "received") {
    return formatDate(order.createdAt);
  }

  if (stageKey === "production") {
    return formatDate(order.notifications?.confirmationEmailSentAt || order.updatedAt);
  }

  if (stageKey === "dispatched") {
    return formatDate(order.shipment?.shippedAt);
  }

  if (stageKey === "delivered") {
    return formatDate(order.deliveredAt);
  }

  return "";
};

export const buildCustomerTimeline = ({ order, recordType }) => {
  const status = getOrderStatus(order, recordType);

  if (TERMINAL_CANCELLED_STATUSES.has(status)) {
    return [
      {
        key: "cancelled",
        label: status === "failed" ? "Needs Attention" : "Cancelled",
        description:
          status === "failed"
            ? "Something needs attention before this order can move forward."
            : "This order is no longer active.",
        state: "current",
        date: formatDate(order.updatedAt),
      },
    ];
  }

  const activeIndex = getStageIndex({ order, recordType });

  return TRACKING_STAGES.map((stage, index) => ({
    ...stage,
    state:
      index < activeIndex
        ? "complete"
        : index === activeIndex
        ? "current"
        : "upcoming",
    date: getStageDate({ order, stageKey: stage.key }),
  }));
};

const getCurrentStage = (timeline = []) =>
  timeline.find((stage) => stage.state === "current") ||
  timeline.find((stage) => stage.state === "complete") ||
  timeline[0];

const serializeItems = (items = []) =>
  items.map((item) => ({
    productName: item.productName || item.sku || "Good Gut Hut item",
    quantity: Number(item.quantity || 0),
  }));

export const serializeTrackedOrder = ({ order, recordType }) => {
  const timeline = buildCustomerTimeline({ order, recordType });
  const currentStage = getCurrentStage(timeline);
  const isPreorder = recordType === "preorder";

  return {
    recordType,
    recordLabel: isPreorder ? "Preorder" : order.mode === "recurring" ? "Recurring order" : "Order",
    orderNumber: order.orderNumber || "",
    customerName: isPreorder ? order.customerName || "" : order.name || "",
    status: getOrderStatus(order, recordType),
    currentStage,
    timeline,
    fulfillmentMethod: order.fulfillmentMethod || "delivery",
    deliveryDate: formatDate(order.deliveryDate || order.firstDeliveryDate || order.nextDeliveryDate),
    shippedAt: formatDate(order.shipment?.shippedAt),
    estimatedArrivalAt: formatDate(order.shipment?.estimatedArrivalAt),
    deliveredAt: formatDate(order.deliveredAt),
    trackingLink: order.shipment?.trackingLink || "",
    totalQuantity: Number(order.totalQuantity || 0),
    currency: order.currency || order.payment?.currency || "INR",
    total: Number(order.total || 0),
    items: serializeItems(order.items || []),
  };
};
