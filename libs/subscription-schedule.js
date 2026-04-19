import { sanitizeDeliveryDaysOfWeek } from "@/libs/subscription-delivery-days";

export const SUBSCRIPTION_SCHEDULE_TIME_ZONE = "Asia/Kolkata";
export const DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS = 3;
export const MAX_SUBSCRIPTION_MINIMUM_LEAD_DAYS = 30;
export const SUBSCRIPTION_START_DATE_WINDOW_DAYS = 30;
export const SUBSCRIPTION_DELIVERY_HOUR_IST = 9;

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET = "+05:30";

const WEEKDAY_TO_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SUBSCRIPTION_SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FRIENDLY_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: SUBSCRIPTION_SCHEDULE_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const FRIENDLY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: SUBSCRIPTION_SCHEDULE_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: SUBSCRIPTION_SCHEDULE_TIME_ZONE,
  weekday: "long",
});

const partsToDateKey = (parts = []) => {
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

export const sanitizeMinimumLeadDays = (value) => {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    return DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS;
  }

  return Math.max(
    0,
    Math.min(MAX_SUBSCRIPTION_MINIMUM_LEAD_DAYS, Math.round(normalized))
  );
};

export const getDateKeyInIndia = (value = new Date()) =>
  partsToDateKey(DATE_KEY_FORMATTER.formatToParts(new Date(value)));

export const parseDateKeyToIstDate = (
  dateKey = "",
  hour = SUBSCRIPTION_DELIVERY_HOUR_IST,
  minute = 0
) => {
  const normalized = String(dateKey || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  return new Date(`${normalized}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${IST_OFFSET}`);
};

export const addDaysToDateKey = (dateKey = "", days = 0) => {
  const base = parseDateKeyToIstDate(dateKey, 12, 0);

  if (!base) {
    return "";
  }

  return getDateKeyInIndia(base.getTime() + Number(days || 0) * DAY_MS);
};

export const getWeekdayValueForDateKey = (dateKey = "") => {
  const date = parseDateKeyToIstDate(dateKey, 12, 0);

  if (!date) {
    return "";
  }

  return WEEKDAY_FORMATTER.format(date).toLowerCase();
};

export const isValidSubscriptionStartDate = ({
  startDate = "",
  deliveryDaysOfWeek = [],
  minimumLeadDays = DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
  now = new Date(),
  windowDays = SUBSCRIPTION_START_DATE_WINDOW_DAYS,
}) => {
  const scheduledAt = parseDateKeyToIstDate(startDate);

  if (!scheduledAt) {
    return false;
  }

  const allowedDays = sanitizeDeliveryDaysOfWeek(deliveryDaysOfWeek);

  if (allowedDays.length === 0) {
    return false;
  }

  const weekday = getWeekdayValueForDateKey(startDate);

  if (!allowedDays.includes(weekday)) {
    return false;
  }

  const threshold = new Date(new Date(now).getTime() + sanitizeMinimumLeadDays(minimumLeadDays) * DAY_MS);
  const latestAllowed = new Date(new Date(now).getTime() + Number(windowDays || 0) * DAY_MS);

  return scheduledAt.getTime() >= threshold.getTime() && scheduledAt.getTime() <= latestAllowed.getTime();
};

export const listAvailableSubscriptionStartDates = ({
  deliveryDaysOfWeek = [],
  minimumLeadDays = DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
  now = new Date(),
  windowDays = SUBSCRIPTION_START_DATE_WINDOW_DAYS,
}) => {
  const allowedDays = sanitizeDeliveryDaysOfWeek(deliveryDaysOfWeek);

  if (allowedDays.length === 0) {
    return [];
  }

  const threshold = new Date(new Date(now).getTime() + sanitizeMinimumLeadDays(minimumLeadDays) * DAY_MS);
  const latestAllowed = new Date(new Date(now).getTime() + Number(windowDays || 0) * DAY_MS);
  const earliestDateKey = getDateKeyInIndia(threshold);
  const latestDateKey = getDateKeyInIndia(latestAllowed);
  const startDate = parseDateKeyToIstDate(earliestDateKey, 12, 0);
  const endDate = parseDateKeyToIstDate(latestDateKey, 12, 0);
  const options = [];

  if (!startDate || !endDate) {
    return [];
  }

  for (let cursor = new Date(startDate); cursor.getTime() <= endDate.getTime(); cursor = new Date(cursor.getTime() + DAY_MS)) {
    const dateKey = getDateKeyInIndia(cursor);
    const weekday = getWeekdayValueForDateKey(dateKey);
    const scheduledAt = parseDateKeyToIstDate(dateKey);

    if (!scheduledAt || !allowedDays.includes(weekday)) {
      continue;
    }

    if (scheduledAt.getTime() < threshold.getTime() || scheduledAt.getTime() > latestAllowed.getTime()) {
      continue;
    }

    options.push({
      value: dateKey,
      label: FRIENDLY_DATE_FORMATTER.format(scheduledAt),
      scheduledAtIso: scheduledAt.toISOString(),
    });
  }

  return options;
};

export const getDefaultSubscriptionStartDate = (config = {}) =>
  listAvailableSubscriptionStartDates(config)[0]?.value || "";

export const formatSubscriptionDate = (dateKey = "") => {
  const date = parseDateKeyToIstDate(dateKey);
  return date ? FRIENDLY_DATE_FORMATTER.format(date) : "";
};

export const formatSubscriptionDateTime = (date = "") => {
  const normalized = date ? new Date(date) : null;
  return normalized && !Number.isNaN(normalized.getTime())
    ? FRIENDLY_DATE_TIME_FORMATTER.format(normalized)
    : "";
};

export const formatMinimumLeadDays = (days = DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS) => {
  const normalized = sanitizeMinimumLeadDays(days);
  return `${normalized} day${normalized === 1 ? "" : "s"}`;
};

export const getSubscriptionCycleDays = (cadence = "") => {
  switch (String(cadence || "").trim().toLowerCase()) {
    case "weekly":
      return 7;
    case "fortnightly":
      return 14;
    case "monthly":
      return 28;
    default:
      return 0;
  }
};

export const getNextSubscriptionDeliveryDate = ({
  startDate = "",
  cadence = "",
  paidCount = 0,
  totalCount = 0,
}) => {
  const cycleDays = getSubscriptionCycleDays(cadence);

  if (!startDate || !cycleDays) {
    return "";
  }

  const normalizedPaidCount = Math.max(0, Number(paidCount || 0));
  const normalizedTotalCount = Math.max(0, Number(totalCount || 0));

  if (normalizedTotalCount > 0 && normalizedPaidCount >= normalizedTotalCount) {
    return "";
  }

  return addDaysToDateKey(startDate, normalizedPaidCount * cycleDays);
};

export const listPlannedSubscriptionDeliveryDates = ({
  startDate = "",
  cadence = "",
  totalCount = 0,
}) => {
  const cycleDays = getSubscriptionCycleDays(cadence);
  const normalizedTotalCount = Math.max(0, Number(totalCount || 0));

  if (!startDate || !cycleDays || normalizedTotalCount === 0) {
    return [];
  }

  return Array.from({ length: normalizedTotalCount }, (_, index) =>
    addDaysToDateKey(startDate, index * cycleDays)
  ).filter(Boolean);
};
