import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const orderPlanItemSchema = mongoose.Schema(
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

const orderPlanPaymentSchema = mongoose.Schema(
  {
    provider: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "not_required",
        "pending",
        "order_created",
        "paid",
        "failed",
        "created",
        "authenticated",
        "active",
        "paused",
        "cancelled",
        "completed",
        "expired",
      ],
      default: "not_required",
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
    orderId: {
      type: String,
      trim: true,
      default: "",
    },
    paymentId: {
      type: String,
      trim: true,
      default: "",
    },
    signature: {
      type: String,
      trim: true,
      default: "",
    },
    webhookEvent: {
      type: String,
      trim: true,
      default: "",
    },
    paidAt: {
      type: Date,
      default: null,
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

const orderPlanNotificationsSchema = mongoose.Schema(
  {
    confirmationEmailSentAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const orderPlanShipmentSchema = mongoose.Schema(
  {
    trackingLink: {
      type: String,
      trim: true,
      default: "",
    },
    shippedAt: {
      type: Date,
      default: null,
    },
    estimatedArrivalAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const orderPlanSchema = mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["one_time", "recurring"],
      required: true,
    },
    paymentType: {
      type: String,
      enum: ["one_time", "recurring"],
      required: true,
    },
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
      enum: ["", "weekly", "fortnightly", "monthly"],
      default: "",
    },
    durationWeeks: {
      type: Number,
      min: 0,
      max: 8,
      default: 0,
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
      type: [orderPlanItemSchema],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one item is required",
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
      enum: [
        "new",
        "payment_pending",
        "active",
        "paused",
        "confirmed",
        "shipped",
        "cancelled",
        "fulfilled",
        "failed",
      ],
      default: "new",
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    shipment: {
      type: orderPlanShipmentSchema,
      default: () => ({}),
    },
    payment: {
      type: orderPlanPaymentSchema,
      default: () => ({}),
    },
    notifications: {
      type: orderPlanNotificationsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

orderPlanSchema.plugin(toJSON);

export default mongoose.models.OrderPlan ||
  mongoose.model("OrderPlan", orderPlanSchema);
