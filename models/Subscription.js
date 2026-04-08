import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const subscriptionItemSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    productName: {
      type: String,
      trim: true,
      required: true,
    },
    quantity: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    unitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    lineTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const subscriptionBillingSchema = mongoose.Schema(
  {
    provider: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["created", "authenticated", "active", "pending", "halted", "paused", "cancelled", "completed", "expired"],
      default: "created",
    },
    planId: {
      type: String,
      trim: true,
      default: "",
    },
    subscriptionId: {
      type: String,
      trim: true,
      default: "",
    },
    shortUrl: {
      type: String,
      trim: true,
      default: "",
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
    },
    totalCount: {
      type: Number,
      min: 1,
      default: 1,
    },
    paidCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    remainingCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    authAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },
    chargeAt: {
      type: Date,
      default: null,
    },
    startAt: {
      type: Date,
      default: null,
    },
    endAt: {
      type: Date,
      default: null,
    },
    mandateEndsAt: {
      type: Date,
      default: null,
    },
    currentStart: {
      type: Date,
      default: null,
    },
    currentEnd: {
      type: Date,
      default: null,
    },
    lastPaymentId: {
      type: String,
      trim: true,
      default: "",
    },
    lastPaymentStatus: {
      type: String,
      trim: true,
      default: "",
    },
    authenticatedAt: {
      type: Date,
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    expiredAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const subscriptionSchema = mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
    },
    address: {
      type: String,
      trim: true,
      required: true,
    },
    deliveryPlaceId: {
      type: String,
      trim: true,
      default: "",
    },
    normalizedDeliveryAddress: {
      type: String,
      trim: true,
      default: "",
    },
    cadence: {
      type: String,
      enum: ["weekly", "fortnightly", "monthly"],
      required: true,
    },
    durationWeeks: {
      type: Number,
      min: 2,
      max: 8,
      required: true,
    },
    selectionMode: {
      type: String,
      enum: ["combo", "custom"],
      default: "custom",
    },
    comboId: {
      type: String,
      trim: true,
      default: "",
    },
    comboName: {
      type: String,
      trim: true,
      default: "",
    },
    deliveryDaysOfWeek: {
      type: [String],
      default: [],
    },
    minimumLeadDays: {
      type: Number,
      min: 0,
      max: 30,
      default: 3,
    },
    startDate: {
      type: String,
      trim: true,
      default: "",
    },
    firstDeliveryDate: {
      type: String,
      trim: true,
      default: "",
    },
    nextDeliveryDate: {
      type: String,
      trim: true,
      default: "",
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
    },
    items: {
      type: [subscriptionItemSchema],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one subscription item is required",
      },
    },
    totalQuantity: {
      type: Number,
      min: 1,
      default: 1,
    },
    subtotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryDistanceKm: {
      type: Number,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      min: 0,
      default: 0,
    },
    source: {
      type: String,
      enum: ["landing", "admin", "manual"],
      default: "landing",
    },
    status: {
      type: String,
      enum: ["new", "contacted", "trial_scheduled", "active", "paused", "cancelled"],
      default: "new",
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    lastEditLinkSentAt: {
      type: Date,
      default: null,
    },
    billing: {
      type: subscriptionBillingSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

subscriptionSchema.plugin(toJSON);

export default mongoose.models.Subscription ||
  mongoose.model("Subscription", subscriptionSchema);
