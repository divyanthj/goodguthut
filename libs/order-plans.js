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
  "paused",
  "cancelled",
  "fulfilled",
  "failed",
];

export const ORDER_PLAN_STATUSES = Array.from(
  new Set([...ONE_TIME_ORDER_PLAN_STATUSES, ...RECURRING_ORDER_PLAN_STATUSES])
);

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
