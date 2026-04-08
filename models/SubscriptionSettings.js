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
    deliveryRouteSnapshots: {
      type: [
        {
          _id: false,
          deliveryDate: {
            type: String,
            trim: true,
            default: "",
          },
          status: {
            type: String,
            enum: ["idle", "ready", "error"],
            default: "idle",
          },
          generatedAt: {
            type: Date,
            default: null,
          },
          originAddress: {
            type: String,
            trim: true,
            default: "",
          },
          totalStops: {
            type: Number,
            min: 0,
            default: 0,
          },
          totalDistanceKm: {
            type: Number,
            min: 0,
            default: 0,
          },
          driverPayout: {
            type: Number,
            min: 0,
            default: 0,
          },
          payoutPerKm: {
            type: Number,
            min: 0,
            default: 0,
          },
          error: {
            type: String,
            trim: true,
            default: "",
          },
          stops: {
            type: [
              {
                _id: false,
                stopNumber: Number,
                subscriptionId: String,
                customerName: String,
                phone: String,
                email: String,
                address: String,
                totalQuantity: Number,
                total: Number,
                cadence: String,
                status: String,
                billingStatus: String,
                nextDeliveryDate: String,
                legDistanceKm: Number,
                cumulativeDistanceKm: Number,
                mapsUrl: String,
                items: {
                  type: [
                    {
                      _id: false,
                      sku: String,
                      productName: String,
                      quantity: Number,
                    },
                  ],
                  default: [],
                },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
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
