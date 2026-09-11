import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const inventoryBatchSchema = mongoose.Schema(
  {
    sku: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sku",
      required: true,
      index: true,
    },
    skuCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      index: true,
    },
    batchCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      unique: true,
    },
    prefix: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      minlength: 4,
      maxlength: 4,
    },
    year: {
      type: Number,
      min: 0,
      max: 99,
      required: true,
    },
    month: {
      type: Number,
      min: 1,
      max: 12,
      required: true,
    },
    sequence: {
      type: Number,
      min: 1,
      max: 99,
      required: true,
    },
    quantityReceived: {
      type: Number,
      min: 1,
      required: true,
    },
    quantityRemaining: {
      type: Number,
      min: 0,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "depleted"],
      default: "active",
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    createdByAdmin: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

inventoryBatchSchema.index({ sku: 1, year: 1, month: 1, sequence: 1 });
inventoryBatchSchema.index({ sku: 1, status: 1, createdAt: 1 });
inventoryBatchSchema.plugin(toJSON);

export default mongoose.models.InventoryBatch ||
  mongoose.model("InventoryBatch", inventoryBatchSchema);
