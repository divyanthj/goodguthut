import {
  addDaysToDateKey,
  getSubscriptionCycleDays,
  parseDateKeyToIstDate,
} from "@/libs/subscription-schedule";

const INDIA_TIMEZONE = "Asia/Kolkata";
const DEFAULT_CURRENCY = "INR";
const DEFAULT_PERIOD = "8w";
const DEFAULT_RESOLUTION = "week";
const DEFAULT_PROJECTION_MODE = "blended";
const BILLABLE_SUBSCRIPTION_STATUSES = new Set(["authenticated", "active", "pending", "completed"]);
const PROJECTABLE_SUBSCRIPTION_STATUSES = new Set(["authenticated", "active", "pending"]);

export const FINANCIAL_PERIOD_OPTIONS = [
  { value: "4w", label: "4 weeks", bucketCount: 4, resolution: "week" },
  { value: "8w", label: "8 weeks", bucketCount: 8, resolution: "week" },
  { value: "12w", label: "12 weeks", bucketCount: 12, resolution: "week" },
  { value: "26w", label: "26 weeks", bucketCount: 26, resolution: "week" },
  { value: "3m", label: "3 months", bucketCount: 3, resolution: "month" },
  { value: "6m", label: "6 months", bucketCount: 6, resolution: "month" },
  { value: "12m", label: "12 months", bucketCount: 12, resolution: "month" },
];

export const FINANCIAL_RESOLUTION_OPTIONS = [
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

export const FINANCIAL_PROJECTION_OPTIONS = [
  { value: "actual", label: "Actual only" },
  { value: "blended", label: "Actual + projected" },
];

const formatPartsInIndia = (value) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(value));
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 0);
  const day = Number(parts.find((part) => part.type === "day")?.value || 0);

  return { year, month, day };
};

const createUtcDateFromParts = ({ year, month, day }) =>
  new Date(Date.UTC(year, Math.max(0, month - 1), day));

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addUtcMonths = (date, months) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const formatDateKey = (date) => date.toISOString().slice(0, 10);

const getStartOfIndiaWeek = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const utcDate = createUtcDateFromParts(formatPartsInIndia(date));
  const dayOfWeek = utcDate.getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - daysFromMonday);
  return utcDate;
};

const getStartOfIndiaMonth = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = formatPartsInIndia(date);
  return createUtcDateFromParts({ year: parts.year, month: parts.month, day: 1 });
};

const formatWeekLabel = (date) => {
  const endDate = addUtcDays(date, 6);
  const labelFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

  return `${labelFormatter.format(date)} - ${labelFormatter.format(endDate)}`;
};

const formatMonthLabel = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  }).format(date);

const normalizeAmount = (value, fallback = 0) => {
  const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Number(numericValue.toFixed(2));
  }

  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) && fallbackValue > 0
    ? Number(fallbackValue.toFixed(2))
    : 0;
};

const normalizeRevenueEvent = ({ date, amount, currency, sourceType }) => {
  const normalizedDate = date ? new Date(date) : null;
  const normalizedAmount = normalizeAmount(amount);
  const normalizedCurrency = String(currency || DEFAULT_CURRENCY).trim().toUpperCase();

  if (!normalizedDate || Number.isNaN(normalizedDate.getTime()) || normalizedAmount <= 0) {
    return null;
  }

  return {
    date: normalizedDate.toISOString(),
    amount: normalizedAmount,
    currency: normalizedCurrency || DEFAULT_CURRENCY,
    sourceType,
  };
};

const getSubscriptionRevenueDate = (subscription = {}) => {
  const billing = subscription.billing || {};

  if (!BILLABLE_SUBSCRIPTION_STATUSES.has(String(billing.status || "").trim())) {
    return null;
  }

  const fallbackCandidates = [
    billing.authenticatedAt,
    billing.activatedAt,
    billing.currentStart,
    billing.startAt,
    subscription.updatedAt,
  ];

  return fallbackCandidates.find((value) => {
    if (!value) {
      return false;
    }

    const candidate = new Date(value);
    return !Number.isNaN(candidate.getTime());
  });
};

const getResolutionConfig = (resolution = DEFAULT_RESOLUTION) => {
  if (resolution === "month") {
    return {
      value: "month",
      label: "month",
      getBucketStart: getStartOfIndiaMonth,
      formatBucketLabel: formatMonthLabel,
      addBuckets: addUtcMonths,
      periodLabel: "month",
      trailingAverageWindow: 4,
    };
  }

  return {
    value: "week",
    label: "week",
    getBucketStart: getStartOfIndiaWeek,
    formatBucketLabel: formatWeekLabel,
    addBuckets: (date, count) => addUtcDays(date, count * 7),
    periodLabel: "week",
    trailingAverageWindow: 4,
  };
};

const getDefaultPeriodForResolution = (resolution = DEFAULT_RESOLUTION) =>
  resolution === "month" ? "6m" : "8w";

const resolveProjectionMode = (value = DEFAULT_PROJECTION_MODE) =>
  FINANCIAL_PROJECTION_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_PROJECTION_MODE;

export const resolveFinancialControls = ({
  period = DEFAULT_PERIOD,
  resolution = DEFAULT_RESOLUTION,
  projectionMode = DEFAULT_PROJECTION_MODE,
} = {}) => {
  const normalizedResolution =
    FINANCIAL_RESOLUTION_OPTIONS.some((option) => option.value === resolution)
      ? resolution
      : DEFAULT_RESOLUTION;
  const matchingPeriod = FINANCIAL_PERIOD_OPTIONS.find(
    (option) => option.value === period && option.resolution === normalizedResolution
  );
  const fallbackPeriod = getDefaultPeriodForResolution(normalizedResolution);
  const selectedPeriod =
    matchingPeriod ||
    FINANCIAL_PERIOD_OPTIONS.find((option) => option.value === fallbackPeriod) ||
    FINANCIAL_PERIOD_OPTIONS[0];

  return {
    resolution: normalizedResolution,
    period: selectedPeriod.value,
    bucketCount: selectedPeriod.bucketCount,
    periodOptions: FINANCIAL_PERIOD_OPTIONS.filter(
      (option) => option.resolution === normalizedResolution
    ),
    resolutionOptions: FINANCIAL_RESOLUTION_OPTIONS,
    projectionMode: resolveProjectionMode(projectionMode),
    projectionOptions: FINANCIAL_PROJECTION_OPTIONS,
  };
};

const getRangeEndLabel = (resolutionConfig, currentBucketStart) => {
  if (resolutionConfig.value === "month") {
    const endOfMonth = addUtcDays(addUtcMonths(currentBucketStart, 1), -1);
    return formatDateKey(endOfMonth);
  }

  return formatDateKey(addUtcDays(currentBucketStart, 6));
};

const createEmptyBucket = (bucketStart, resolutionConfig) => ({
  bucketStart,
  weekStart: bucketStart,
  weekLabel: resolutionConfig.formatBucketLabel(new Date(`${bucketStart}T00:00:00.000Z`)),
  revenue: 0,
  ordersRevenue: 0,
  subscriptionsRevenue: 0,
});

const createEmptyProjectionBucket = (bucketStart, resolutionConfig) => ({
  bucketStart,
  weekStart: bucketStart,
  weekLabel: resolutionConfig.formatBucketLabel(new Date(`${bucketStart}T00:00:00.000Z`)),
  projectedRevenue: 0,
  projectedOrdersRevenue: 0,
  projectedSubscriptionsRevenue: 0,
});

const buildHistoricalRevenueSeries = ({
  events = [],
  resolutionConfig,
  currentBucketStart,
  bucketCount,
}) => {
  const firstBucketStart = resolutionConfig.addBuckets(currentBucketStart, -(bucketCount - 1));
  const buckets = new Map();

  for (let offset = 0; offset < bucketCount; offset += 1) {
    const bucketStart = resolutionConfig.addBuckets(firstBucketStart, offset);
    const key = formatDateKey(bucketStart);
    buckets.set(key, createEmptyBucket(key, resolutionConfig));
  }

  events.forEach((event) => {
    const bucketStart = resolutionConfig.getBucketStart(event.date);
    const bucketKey = bucketStart ? formatDateKey(bucketStart) : "";
    const bucket = buckets.get(bucketKey);

    if (!bucket) {
      return;
    }

    const amount = normalizeAmount(event.amount);
    bucket.revenue = Number((bucket.revenue + amount).toFixed(2));

    if (event.sourceType === "subscription") {
      bucket.subscriptionsRevenue = Number((bucket.subscriptionsRevenue + amount).toFixed(2));
    } else {
      bucket.ordersRevenue = Number((bucket.ordersRevenue + amount).toFixed(2));
    }
  });

  return [...buckets.values()];
};

const buildProjectionSeries = ({
  resolutionConfig,
  currentBucketStart,
  bucketCount,
}) => {
  const buckets = new Map();

  for (let offset = 1; offset <= bucketCount; offset += 1) {
    const bucketStart = resolutionConfig.addBuckets(currentBucketStart, offset);
    const key = formatDateKey(bucketStart);
    buckets.set(key, createEmptyProjectionBucket(key, resolutionConfig));
  }

  return buckets;
};

const getProjectedOrderRevenueSeries = ({
  revenueSeries = [],
  trailingAverageWindow = 4,
  projectionBucketCount = 0,
}) => {
  const completedBuckets = revenueSeries.slice(0, -1).slice(-trailingAverageWindow);

  if (completedBuckets.length === 0 || projectionBucketCount <= 0) {
    return {
      values: [],
      baseline: 0,
      slope: 0,
    };
  }

  const weighted = completedBuckets.reduce(
    (result, entry, index) => {
      const weight = index + 1;
      const value = Number(entry.ordersRevenue || 0);

      result.weightedRevenue += value * weight;
      result.totalWeight += weight;
      result.values.push(value);
      return result;
    },
    { weightedRevenue: 0, totalWeight: 0, values: [] }
  );
  const baseline =
    weighted.totalWeight > 0
      ? Number((weighted.weightedRevenue / weighted.totalWeight).toFixed(2))
      : 0;
  const deltas = weighted.values.slice(1).map((value, index) => value - weighted.values[index]);
  const rawSlope =
    deltas.length > 0
      ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length
      : 0;
  const slopeCap = baseline > 0 ? baseline * 0.35 : 0;
  const slope = Number(
    Math.max(-slopeCap, Math.min(slopeCap, rawSlope || 0)).toFixed(2)
  );
  const values = Array.from({ length: projectionBucketCount }, (_, index) => {
    const projectedValue = Math.max(0, baseline + slope * index);
    return Number(projectedValue.toFixed(2));
  });

  return {
    values,
    baseline,
    slope,
  };
};

const getProjectedSubscriptionEvents = ({
  subscriptions = [],
  firstProjectedBucketStart,
  projectionEnd,
}) => {
  const events = [];

  subscriptions.forEach((subscription) => {
    const billing = subscription.billing || {};
    const billingStatus = String(billing.status || "").trim().toLowerCase();

    if (!PROJECTABLE_SUBSCRIPTION_STATUSES.has(billingStatus)) {
      return;
    }

    const currency = String(
      billing.currency || subscription.currency || DEFAULT_CURRENCY
    ).trim().toUpperCase();
    const amount = normalizeAmount(billing.amount, subscription.total);
    const paidCount = Math.max(0, Number(billing.paidCount || 0));
    const totalCount = Math.max(0, Number(billing.totalCount || 0));
    const billingStartDate = billing.startAt
      ? formatDateKey(createUtcDateFromParts(formatPartsInIndia(billing.startAt)))
      : "";
    const startDate = String(billingStartDate || subscription.startDate || "").trim();
    const cycleDays = getSubscriptionCycleDays(subscription.cadence);

    if (
      !currency ||
      currency !== DEFAULT_CURRENCY ||
      amount <= 0 ||
      !startDate ||
      totalCount <= 0 ||
      cycleDays <= 0
    ) {
      return;
    }

    for (let occurrenceIndex = paidCount; occurrenceIndex < totalCount; occurrenceIndex += 1) {
      const occurrenceDateKey = addDaysToDateKey(
        startDate,
        occurrenceIndex * cycleDays
      );
      const occurrenceDate = parseDateKeyToIstDate(occurrenceDateKey);

      if (!occurrenceDate || Number.isNaN(occurrenceDate.getTime())) {
        continue;
      }

      if (
        occurrenceDate.getTime() < firstProjectedBucketStart.getTime() ||
        occurrenceDate.getTime() > projectionEnd.getTime()
      ) {
        continue;
      }

      events.push({
        date: occurrenceDate.toISOString(),
        amount,
        currency,
      });
    }
  });

  return events;
};

const applyProjectedOrderRevenue = ({
  projectionBuckets,
  projectedOrderRevenueSeries = [],
}) => {
  if (projectedOrderRevenueSeries.length === 0) {
    return;
  }

  [...projectionBuckets.values()].forEach((bucket, index) => {
    const projectedOrderRevenue = Number(projectedOrderRevenueSeries[index] || 0);

    if (projectedOrderRevenue <= 0) {
      return;
    }

    bucket.projectedOrdersRevenue = projectedOrderRevenue;
    bucket.projectedRevenue = Number(
      (bucket.projectedRevenue + projectedOrderRevenue).toFixed(2)
    );
  });
};

const applyProjectedSubscriptionRevenue = ({
  projectionBuckets,
  subscriptionEvents = [],
  resolutionConfig,
}) => {
  subscriptionEvents.forEach((event) => {
    const bucketStart = resolutionConfig.getBucketStart(event.date);
    const bucketKey = bucketStart ? formatDateKey(bucketStart) : "";
    const bucket = projectionBuckets.get(bucketKey);

    if (!bucket) {
      return;
    }

    const amount = normalizeAmount(event.amount);
    bucket.projectedSubscriptionsRevenue = Number(
      (bucket.projectedSubscriptionsRevenue + amount).toFixed(2)
    );
    bucket.projectedRevenue = Number((bucket.projectedRevenue + amount).toFixed(2));
  });
};

export const buildFinancialStats = ({
  preorders = [],
  orderPlans = [],
  subscriptions = [],
  period = DEFAULT_PERIOD,
  resolution = DEFAULT_RESOLUTION,
  projectionMode = DEFAULT_PROJECTION_MODE,
} = {}) => {
  const controls = resolveFinancialControls({ period, resolution, projectionMode });
  const resolutionConfig = getResolutionConfig(controls.resolution);
  const eventSources = [
    ...preorders.map((preorder) =>
      normalizeRevenueEvent({
        date: preorder.payment?.paidAt,
        amount: normalizeAmount(preorder.payment?.amount, preorder.total),
        currency: preorder.currency,
        sourceType: "preorder",
      })
    ),
    ...orderPlans.map((orderPlan) =>
      normalizeRevenueEvent({
        date: orderPlan.payment?.paidAt,
        amount: normalizeAmount(orderPlan.payment?.amount, orderPlan.total),
        currency: orderPlan.currency,
        sourceType: "order_plan",
      })
    ),
    ...subscriptions.map((subscription) =>
      normalizeRevenueEvent({
        date: getSubscriptionRevenueDate(subscription),
        amount: normalizeAmount(subscription.billing?.amount, subscription.total),
        currency: subscription.billing?.currency || subscription.currency,
        sourceType: "subscription",
      })
    ),
  ].filter(Boolean);

  const includedEvents = [];
  const excludedCurrencies = new Set();

  eventSources.forEach((event) => {
    if (event.currency !== DEFAULT_CURRENCY) {
      excludedCurrencies.add(event.currency);
      return;
    }

    includedEvents.push(event);
  });

  const currentBucketStart =
    resolutionConfig.getBucketStart(new Date()) ||
    createUtcDateFromParts(formatPartsInIndia(new Date()));
  const revenueSeries = buildHistoricalRevenueSeries({
    events: includedEvents,
    resolutionConfig,
    currentBucketStart,
    bucketCount: controls.bucketCount,
  });
  const currentBucketKey = formatDateKey(currentBucketStart);
  const previousBucketKey = formatDateKey(resolutionConfig.addBuckets(currentBucketStart, -1));
  const currentPeriodRevenue =
    revenueSeries.find((entry) => entry.bucketStart === currentBucketKey)?.revenue || 0;
  const previousPeriodRevenue =
    revenueSeries.find((entry) => entry.bucketStart === previousBucketKey)?.revenue || 0;
  const periodDelta = Number((currentPeriodRevenue - previousPeriodRevenue).toFixed(2));
  const periodDeltaPercent =
    previousPeriodRevenue > 0
      ? Number(
          (
            ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) *
            100
          ).toFixed(2)
        )
      : currentPeriodRevenue > 0
        ? 100
        : 0;
  const rangeRevenue = Number(
    revenueSeries.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0).toFixed(2)
  );
  const ordersRevenue = Number(
    revenueSeries.reduce((sum, entry) => sum + Number(entry.ordersRevenue || 0), 0).toFixed(2)
  );
  const subscriptionsRevenue = Number(
    revenueSeries
      .reduce((sum, entry) => sum + Number(entry.subscriptionsRevenue || 0), 0)
      .toFixed(2)
  );

  const projectionBuckets = buildProjectionSeries({
    resolutionConfig,
    currentBucketStart,
    bucketCount: controls.bucketCount,
  });
  const firstProjectedBucketStart = resolutionConfig.addBuckets(currentBucketStart, 1);
  const lastProjectedBucketStart = resolutionConfig.addBuckets(
    currentBucketStart,
    controls.bucketCount
  );
  const projectionEnd =
    resolutionConfig.value === "month"
      ? addUtcDays(addUtcMonths(lastProjectedBucketStart, 1), -1)
      : addUtcDays(lastProjectedBucketStart, 6);
  const projectedOrderRevenue = getProjectedOrderRevenueSeries({
    revenueSeries,
    trailingAverageWindow: resolutionConfig.trailingAverageWindow,
    projectionBucketCount: controls.bucketCount,
  });
  const projectedSubscriptionEvents = getProjectedSubscriptionEvents({
    subscriptions,
    firstProjectedBucketStart,
    projectionEnd,
  });

  applyProjectedOrderRevenue({
    projectionBuckets,
    projectedOrderRevenueSeries: projectedOrderRevenue.values,
  });
  applyProjectedSubscriptionRevenue({
    projectionBuckets,
    subscriptionEvents: projectedSubscriptionEvents,
    resolutionConfig,
  });

  const projectionSeries = [...projectionBuckets.values()];
  const projectedRangeRevenue = Number(
    projectionSeries
      .reduce((sum, entry) => sum + Number(entry.projectedRevenue || 0), 0)
      .toFixed(2)
  );
  const projectedOrdersRevenue = Number(
    projectionSeries
      .reduce((sum, entry) => sum + Number(entry.projectedOrdersRevenue || 0), 0)
      .toFixed(2)
  );
  const projectedSubscriptionsRevenue = Number(
    projectionSeries
      .reduce((sum, entry) => sum + Number(entry.projectedSubscriptionsRevenue || 0), 0)
      .toFixed(2)
  );

  return {
    summary: {
      currentPeriodRevenue,
      previousPeriodRevenue,
      periodDelta,
      periodDeltaPercent,
      rangeRevenue,
      ordersRevenue,
      subscriptionsRevenue,
      currency: DEFAULT_CURRENCY,
      currentPeriodLabel: `Current ${resolutionConfig.periodLabel}`,
      previousPeriodLabel: `Previous ${resolutionConfig.periodLabel}`,
      deltaLabel:
        resolutionConfig.value === "month" ? "Month-over-month change" : "Week-over-week change",
    },
    revenueSeries,
    projectionSeries,
    projectionSummary: {
      currency: DEFAULT_CURRENCY,
      projectionMode: controls.projectionMode,
      projectedRevenue: projectedRangeRevenue,
      projectedOrdersRevenue,
      projectedSubscriptionsRevenue,
      forwardWindowLabel: `Next ${controls.bucketCount} ${
        resolutionConfig.value === "month" ? "months" : "weeks"
      }`,
      trailingAverageWindow: resolutionConfig.trailingAverageWindow,
      projectedOrdersBaseline: projectedOrderRevenue.baseline,
      projectedOrdersSlope: projectedOrderRevenue.slope,
    },
    projection: {
      mode: controls.projectionMode,
      isEnabled: controls.projectionMode !== "actual",
      options: controls.projectionOptions,
    },
    range: {
      period: controls.period,
      resolution: controls.resolution,
      bucketCount: controls.bucketCount,
      startDate: revenueSeries[0]?.bucketStart || "",
      endDate: revenueSeries.length ? getRangeEndLabel(resolutionConfig, currentBucketStart) : "",
      projectionStartDate: projectionSeries[0]?.bucketStart || "",
      projectionEndDate: projectionSeries.length
        ? getRangeEndLabel(resolutionConfig, lastProjectedBucketStart)
        : "",
    },
    controls,
    excludedCurrencies: [...excludedCurrencies].sort(),
    totals: {
      includedEventCount: includedEvents.length,
      excludedEventCount: eventSources.length - includedEvents.length,
    },
  };
};
