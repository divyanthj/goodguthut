export const ONE_TIME_MIN_TOTAL_QTY = 4;
export const DEFAULT_RECURRING_MIN_TOTAL_QTY = 6;
export const MAX_TOTAL_QTY = 24;

export const sanitizeRecurringMinTotalQuantity = (value) => {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    return DEFAULT_RECURRING_MIN_TOTAL_QTY;
  }

  return Math.max(
    ONE_TIME_MIN_TOTAL_QTY,
    Math.min(MAX_TOTAL_QTY, Math.round(normalized))
  );
};
