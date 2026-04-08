export const SUBSCRIPTION_WEEKDAY_OPTIONS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const WEEKDAY_SET = new Set(SUBSCRIPTION_WEEKDAY_OPTIONS.map((item) => item.value));

export const sanitizeDeliveryDaysOfWeek = (days = []) => {
  const seen = new Set();

  return (Array.isArray(days) ? days : [])
    .map((day) => String(day || "").trim().toLowerCase())
    .filter((day) => WEEKDAY_SET.has(day))
    .filter((day) => {
      if (seen.has(day)) {
        return false;
      }

      seen.add(day);
      return true;
    });
};

export const formatDeliveryDaysOfWeek = (days = []) => {
  const labels = sanitizeDeliveryDaysOfWeek(days)
    .map((day) => SUBSCRIPTION_WEEKDAY_OPTIONS.find((option) => option.value === day)?.label || day);

  if (labels.length === 0) {
    return "Delivery days will be confirmed after you subscribe.";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};
