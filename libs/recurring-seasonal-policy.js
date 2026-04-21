import { listPlannedSubscriptionDeliveryDates } from "@/libs/subscription-schedule";

export const RECURRING_SEASONAL_FULL_PERIOD_ERROR =
  "This recurring plan includes items not available for all deliveries in the selected duration.";

const isSeasonal = (skuType = "") => String(skuType || "").trim().toLowerCase() === "seasonal";

const isDateKey = (value = "") => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const toSeasonalCutoffMap = (skuCatalog = []) =>
  new Map(
    (Array.isArray(skuCatalog) ? skuCatalog : [])
      .filter((item) => isSeasonal(item?.skuType))
      .map((item) => [
        String(item?.sku || "").trim().toUpperCase(),
        String(item?.recurringCutoffDate || "").trim(),
      ])
      .filter(([sku]) => Boolean(sku))
  );

export const findFirstInvalidRecurringDeliveryIndex = ({
  items = [],
  plannedDeliveryDates = [],
  seasonalCutoffBySku = new Map(),
}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const normalizedDates = Array.isArray(plannedDeliveryDates) ? plannedDeliveryDates : [];

  for (let dateIndex = 0; dateIndex < normalizedDates.length; dateIndex += 1) {
    const deliveryDate = String(normalizedDates[dateIndex] || "").trim();

    if (!isDateKey(deliveryDate)) {
      return dateIndex;
    }

    for (const item of normalizedItems) {
      if (!isSeasonal(item?.skuType)) {
        continue;
      }

      const sku = String(item?.sku || "").trim().toUpperCase();
      const itemCutoff = String(item?.recurringCutoffDate || "").trim();
      const catalogCutoff = String(seasonalCutoffBySku.get(sku) || "").trim();
      const effectiveCutoff = catalogCutoff || itemCutoff;

      if (!isDateKey(effectiveCutoff)) {
        return dateIndex;
      }

      if (deliveryDate >= effectiveCutoff) {
        return dateIndex;
      }
    }
  }

  return -1;
};

export const getValidRecurringDeliveryCount = ({
  items = [],
  startDate = "",
  cadence = "",
  requestedTotalCount = 0,
  seasonalCutoffBySku = new Map(),
}) => {
  const normalizedRequested = Math.max(0, Number(requestedTotalCount || 0));

  if (normalizedRequested === 0) {
    return 0;
  }

  const plannedDeliveryDates = listPlannedSubscriptionDeliveryDates({
    startDate,
    cadence,
    totalCount: normalizedRequested,
  });

  const invalidIndex = findFirstInvalidRecurringDeliveryIndex({
    items,
    plannedDeliveryDates,
    seasonalCutoffBySku,
  });

  if (invalidIndex < 0) {
    return normalizedRequested;
  }

  return Math.max(0, Math.min(normalizedRequested, invalidIndex));
};

export const getSeasonalCoverageError = ({
  items = [],
  plannedDeliveryDates = [],
  seasonalCutoffBySku = new Map(),
}) => {
  const invalidIndex = findFirstInvalidRecurringDeliveryIndex({
    items,
    plannedDeliveryDates,
    seasonalCutoffBySku,
  });

  return invalidIndex >= 0 ? RECURRING_SEASONAL_FULL_PERIOD_ERROR : "";
};

export const buildSeasonalCutoffMapFromCatalog = (skuCatalog = []) =>
  toSeasonalCutoffMap(skuCatalog);
