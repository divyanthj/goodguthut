export const ONE_TIME_ORDER_PLAN_STATUSES = [
  "new",
  "payment_pending",
  "confirmed",
  "shipped",
  "fulfilled",
  "cancelled",
  "failed",
  // Legacy value used by older one-time records.
  "active",
];

export const RECURRING_ORDER_PLAN_STATUSES = [
  "new",
  "payment_pending",
  "active",
  "shipped",
  "paused",
  "cancelled",
  "fulfilled",
  "failed",
];

export const ORDER_PLAN_STATUSES = Array.from(
  new Set([...ONE_TIME_ORDER_PLAN_STATUSES, ...RECURRING_ORDER_PLAN_STATUSES])
);

export const RECURRING_ORDER_PLAN_CONFIRMED_PAYMENT_STATUSES = new Set([
  "authenticated",
  "active",
  "pending",
  "created",
]);

export const RECURRING_ORDER_PLAN_BLOCKED_STATUSES = new Set([
  "cancelled",
  "failed",
  "fulfilled",
  "paused",
]);

export const RECURRING_ORDER_PLAN_BLOCKED_PAYMENT_STATUSES = new Set([
  "cancelled",
  "completed",
  "expired",
  "failed",
]);

export const normalizeOneTimeOrderPlanStatus = (status = "") => {
  const trimmed = String(status || "").trim();
  return trimmed === "active" ? "confirmed" : trimmed;
};

export const getOrderPlanDisplayStatus = ({ mode = "", status = "" } = {}) => {
  if (mode === "one_time") {
    return normalizeOneTimeOrderPlanStatus(status);
  }

  return String(status || "").trim();
};

export const isRecurringOrderPlanConfirmed = (orderPlan = {}) => {
  const status = String(orderPlan.status || "").trim();
  const paymentStatus = String(orderPlan.payment?.status || "").trim();

  if (
    RECURRING_ORDER_PLAN_BLOCKED_STATUSES.has(status) ||
    RECURRING_ORDER_PLAN_BLOCKED_PAYMENT_STATUSES.has(paymentStatus)
  ) {
    return false;
  }

  return (
    status === "active" ||
    status === "shipped" ||
    RECURRING_ORDER_PLAN_CONFIRMED_PAYMENT_STATUSES.has(paymentStatus)
  );
};

export const getAllowedOrderPlanStatuses = (mode = "") => {
  if (mode === "one_time") {
    return ONE_TIME_ORDER_PLAN_STATUSES;
  }

  if (mode === "recurring") {
    return RECURRING_ORDER_PLAN_STATUSES;
  }

  return ORDER_PLAN_STATUSES;
};

export const assertValidOrderPlanStatus = (status = "", mode = "") => {
  const allowedStatuses = getAllowedOrderPlanStatuses(mode);

  if (!allowedStatuses.includes(String(status || "").trim())) {
    throw new Error("Invalid order status.");
  }
};
