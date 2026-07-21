import SubscriptionSettings from "@/models/SubscriptionSettings";
import { DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS } from "@/libs/subscription-schedule";
import {
  DEFAULT_RECURRING_MIN_TOTAL_QTY,
  sanitizeRecurringMinTotalQuantity,
} from "@/libs/order-quantity";
import {
  DEFAULT_CATEGORY_LEAD_TIMES,
  sanitizeCategoryLeadTimes,
} from "@/libs/sku-catalog";
export {
  SUBSCRIPTION_WEEKDAY_OPTIONS,
  sanitizeDeliveryDaysOfWeek,
  formatDeliveryDaysOfWeek,
} from "@/libs/subscription-delivery-days";
export {
  DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
  MAX_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
  sanitizeMinimumLeadDays,
  formatMinimumLeadDays,
} from "@/libs/subscription-schedule";
export {
  DEFAULT_RECURRING_MIN_TOTAL_QTY,
  sanitizeRecurringMinTotalQuantity,
} from "@/libs/order-quantity";
export {
  DEFAULT_CATEGORY_LEAD_TIMES,
  SKU_CATEGORY_OPTIONS,
  sanitizeCategoryLeadTimes,
} from "@/libs/sku-catalog";

export const getSettingsCategoryLeadTimes = (settings = {}) => {
  const rawLeadTimes =
    settings?.categoryLeadTimes instanceof Map
      ? Object.fromEntries(settings.categoryLeadTimes.entries())
      : settings?.categoryLeadTimes || {};

  return sanitizeCategoryLeadTimes(rawLeadTimes);
};

export const getSubscriptionSettings = async () => {
  let settings = await SubscriptionSettings.findOne({}).sort({ updatedAt: -1, createdAt: -1 });

  if (!settings) {
    settings = await SubscriptionSettings.create({
      deliveryDaysOfWeek: [],
      minimumLeadDays: DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
      recurringMinTotalQuantity: DEFAULT_RECURRING_MIN_TOTAL_QTY,
      categoryLeadTimes: DEFAULT_CATEGORY_LEAD_TIMES,
      deliveryRouteSnapshots: [],
    });
  }

  settings.recurringMinTotalQuantity = sanitizeRecurringMinTotalQuantity(
    settings.recurringMinTotalQuantity
  );
  settings.categoryLeadTimes = getSettingsCategoryLeadTimes(settings);

  return settings;
};
