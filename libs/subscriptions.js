export const SUBSCRIPTION_CADENCES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

export const SUBSCRIPTION_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "trial_scheduled", label: "Trial scheduled" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_SET = new Set(SUBSCRIPTION_STATUSES.map((item) => item.value));

export const assertValidSubscriptionStatus = (status = "") => {
  if (!STATUS_SET.has(status)) {
    throw new Error("Invalid subscription status.");
  }
};

export const formatSubscriptionCadence = (value = "") => {
  const match = SUBSCRIPTION_CADENCES.find((item) => item.value === value);
  return match?.label || value || "-";
};

export const getSubscriptionSummaryCounts = (subscriptions = []) =>
  subscriptions.reduce(
    (summary, subscription) => {
      const status = subscription.status || "new";
      summary.total += 1;
      summary[status] = Number(summary[status] || 0) + 1;
      return summary;
    },
    {
      total: 0,
      new: 0,
      contacted: 0,
      trial_scheduled: 0,
      active: 0,
      paused: 0,
      cancelled: 0,
    }
  );

export const getSubscriptionCadenceConfig = (cadence = "") => {
  switch (cadence) {
    case "weekly":
      return { period: "weekly", interval: 1, totalCount: 520, label: "Weekly" };
    case "fortnightly":
      return { period: "weekly", interval: 2, totalCount: 260, label: "Fortnightly" };
    case "monthly":
      return { period: "monthly", interval: 1, totalCount: 120, label: "Monthly" };
    default:
      throw new Error("Select a valid subscription cadence.");
  }
};

export const isMutableBillingStatus = (status = "") =>
  !status || ["created", "cancelled", "completed", "expired"].includes(status);
