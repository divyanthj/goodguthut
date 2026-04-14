export const ORDER_PLAN_STATUSES = [
  "new",
  "payment_pending",
  "active",
  "paused",
  "cancelled",
  "fulfilled",
  "failed",
];

export const assertValidOrderPlanStatus = (status = "") => {
  if (!ORDER_PLAN_STATUSES.includes(status)) {
    throw new Error("Invalid order status.");
  }
};
