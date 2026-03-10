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
      required: true,
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
    source: {
      type: String,
      enum: ["landing", "admin", "marketplace", "manual"],
      default: "landing",
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "fulfilled"],
      default: "pending",
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
