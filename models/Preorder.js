import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const preorderItemSchema = mongoose.Schema(
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

const preorderPaymentSchema = mongoose.Schema(
  {
    provider: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["not_required", "pending", "order_created", "paid", "failed", "refunded"],
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
  },
  { _id: false }
);

const preorderSchema = mongoose.Schema(
  {
    customerName: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      required: true,
    },
    address: {
      type: String,
      trim: true,
      required: true,
    },
    customerNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    preorderWindow: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PreorderWindow",
      default: null,
    },
    preorderWindowLabel: {
      type: String,
      trim: true,
      default: "",
    },
    deliveryDate: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
    },
    items: {
      type: [preorderItemSchema],
      default: [],
      validate: {
        validator: (value) => value.length > 0,
        message: "At least one preorder item is required",
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
    normalizedDeliveryAddress: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      enum: ["landing", "admin", "marketplace", "manual"],
      default: "landing",
    },
    status: {
      type: String,
      enum: ["pending", "payment_pending", "paid", "confirmed", "cancelled", "fulfilled"],
      default: "pending",
    },
    payment: {
      type: preorderPaymentSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

preorderSchema.plugin(toJSON);

export default mongoose.models.Preorder ||
  mongoose.model("Preorder", preorderSchema);
