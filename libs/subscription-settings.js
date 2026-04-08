import SubscriptionSettings from "@/models/SubscriptionSettings";
import { DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS } from "@/libs/subscription-schedule";
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

export const getSubscriptionSettings = async () => {
  let settings = await SubscriptionSettings.findOne({}).sort({ updatedAt: -1, createdAt: -1 });

  if (!settings) {
    settings = await SubscriptionSettings.create({
      deliveryDaysOfWeek: [],
      minimumLeadDays: DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
    });
  }

  return settings;
};
