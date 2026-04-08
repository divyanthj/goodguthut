export const SUBSCRIPTION_CADENCES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

export const SUBSCRIPTION_SELECTION_MODES = [
  { value: "combo", label: "Curated combo" },
  { value: "custom", label: "Custom combo" },
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

export const formatSubscriptionDuration = (durationWeeks = 0) => {
  const normalized = Number(durationWeeks || 0);

  if (normalized === 8) {
    return "2 months";
  }

  if (normalized === 4) {
    return "1 month";
  }

  return `${normalized} week${normalized === 1 ? "" : "s"}`;
};

export const formatSubscriptionSelectionMode = (value = "") => {
  const match = SUBSCRIPTION_SELECTION_MODES.find((item) => item.value === value);
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
      return { period: "weekly", interval: 1, label: "Weekly", weeksPerCycle: 1 };
    case "fortnightly":
      return { period: "weekly", interval: 2, label: "Fortnightly", weeksPerCycle: 2 };
    case "monthly":
      return { period: "monthly", interval: 1, label: "Monthly", weeksPerCycle: 4 };
    default:
      throw new Error("Select a valid subscription cadence.");
  }
};

export const getSubscriptionDurationOptions = (cadence = "") => {
  switch (cadence) {
    case "weekly":
      return [2, 3, 4, 6, 8];
    case "fortnightly":
      return [2, 4, 6, 8];
    case "monthly":
      return [4, 8];
    default:
      return [];
  }
};

export const getSubscriptionDurationConfig = (
  cadence = "",
  durationWeeks = 0
) => {
  const cadenceConfig = getSubscriptionCadenceConfig(cadence);
  const normalizedDuration = Number(durationWeeks || 0);
  const allowedDurations = getSubscriptionDurationOptions(cadence);

  if (!allowedDurations.includes(normalizedDuration)) {
    throw new Error("Select a valid subscription duration.");
  }

  const totalCount = Math.max(
    1,
    Math.round(normalizedDuration / cadenceConfig.weeksPerCycle)
  );

  return {
    ...cadenceConfig,
    durationWeeks: normalizedDuration,
    durationLabel: formatSubscriptionDuration(normalizedDuration),
    totalCount,
  };
};

export const isMutableBillingStatus = (status = "") =>
  !status || ["created", "cancelled", "completed", "expired"].includes(status);

export const canEditSubscriptionBilling = (billing = {}, now = new Date()) => {
  const status = billing?.status || "";

  if (isMutableBillingStatus(status)) {
    return true;
  }

  const paidCount = Number(billing?.paidCount || 0);
  const startAt = billing?.startAt ? new Date(billing.startAt) : null;

  if (!startAt || Number.isNaN(startAt.getTime())) {
    return false;
  }

  return (
    paidCount === 0 &&
    startAt.getTime() > new Date(now).getTime() &&
    ["authenticated", "active", "pending"].includes(status)
  );
};
