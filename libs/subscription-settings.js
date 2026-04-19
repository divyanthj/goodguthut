import SubscriptionSettings from "@/models/SubscriptionSettings";
import { DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS } from "@/libs/subscription-schedule";
import {
  DEFAULT_RECURRING_MIN_TOTAL_QTY,
  sanitizeRecurringMinTotalQuantity,
} from "@/libs/order-quantity";
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

export const getSubscriptionSettings = async () => {
  let settings = await SubscriptionSettings.findOne({}).sort({ updatedAt: -1, createdAt: -1 });

  if (!settings) {
    settings = await SubscriptionSettings.create({
      deliveryDaysOfWeek: [],
      minimumLeadDays: DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
      recurringMinTotalQuantity: DEFAULT_RECURRING_MIN_TOTAL_QTY,
      deliveryRouteSnapshots: [],
    });
  }

  settings.recurringMinTotalQuantity = sanitizeRecurringMinTotalQuantity(
    settings.recurringMinTotalQuantity
  );

  return settings;
};
