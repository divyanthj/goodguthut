import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const windowItemSchema = mongoose.Schema(
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
    unitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    maxPerOrder: {
      type: Number,
      min: 1,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const preorderWindowSchema = mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ["draft", "open", "closed", "archived"],
      default: "draft",
    },
    opensAt: {
      type: Date,
      default: null,
    },
    closesAt: {
      type: Date,
      default: null,
    },
    deliveryDate: {
      type: Date,
      required: true,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
    },
    allowedItems: {
      type: [windowItemSchema],
      default: [],
    },
    allowCustomerNotes: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

preorderWindowSchema.plugin(toJSON);

export default mongoose.models.PreorderWindow ||
  mongoose.model("PreorderWindow", preorderWindowSchema);
