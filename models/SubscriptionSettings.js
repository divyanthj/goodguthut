import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";
import { DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS } from "@/libs/subscription-schedule";

const subscriptionSettingsSchema = mongoose.Schema(
  {
    deliveryDaysOfWeek: {
      type: [String],
      default: [],
    },
    minimumLeadDays: {
      type: Number,
      min: 0,
      max: 30,
      default: DEFAULT_SUBSCRIPTION_MINIMUM_LEAD_DAYS,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

subscriptionSettingsSchema.plugin(toJSON);

export default mongoose.models.SubscriptionSettings ||
  mongoose.model("SubscriptionSettings", subscriptionSettingsSchema);
