import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const skuSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      trim: true,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      enum: [
        "kanji",
        "sparkle",
        "pickles",
        "gift_packs",
        "subscriptions",
        "custom_orders",
        "other",
      ],
      default: "other",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    benefits: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    leadTimeDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    packLabel: {
      type: String,
      trim: true,
      default: "",
    },
    unitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    hsnCode: {
      type: String,
      trim: true,
      default: "",
    },
    gstRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    skuType: {
      type: String,
      enum: ["perennial", "seasonal"],
      default: "perennial",
    },
    recurringCutoffDate: {
      type: String,
      trim: true,
      default: "",
    },
    inventoryTrackingEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    inventoryOnHand: {
      type: Number,
      min: 0,
      default: 0,
    },
    inventoryReserved: {
      type: Number,
      min: 0,
      default: 0,
    },
    inventoryBatchPrefix: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      validate: {
        validator: (value) => !value || /^[A-Z0-9]{4}$/.test(value),
        message: "Inventory batch prefix must contain four letters or digits.",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

skuSchema.plugin(toJSON);

export default mongoose.models.Sku || mongoose.model("Sku", skuSchema);
