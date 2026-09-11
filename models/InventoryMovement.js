import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const inventoryMovementBatchAllocationSchema = mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryBatch",
      default: null,
    },
    batchCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const inventoryMovementSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "opening_balance",
        "manual_adjustment",
        "batch_added",
        "batch_adjusted",
        "reservation_created",
        "reservation_adjusted",
        "reservation_released",
        "reservation_expired",
        "sale_committed",
        "recurring_cycle_committed",
        "shortfall_recorded",
        "tracking_disabled",
      ],
      required: true,
      index: true,
    },
    onHandDelta: {
      type: Number,
      default: 0,
    },
    reservedDelta: {
      type: Number,
      default: 0,
    },
    onHandAfter: {
      type: Number,
      min: 0,
      default: 0,
    },
    reservedAfter: {
      type: Number,
      min: 0,
      default: 0,
    },
    batchAllocations: {
      type: [inventoryMovementBatchAllocationSchema],
      default: [],
    },
    orderPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderPlan",
      default: null,
      index: true,
    },
    orderNumber: {
      type: String,
      trim: true,
      default: "",
    },
    actorType: {
      type: String,
      enum: ["system", "customer", "admin", "webhook"],
      default: "system",
    },
    actorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

inventoryMovementSchema.index({ idempotencyKey: 1 });
inventoryMovementSchema.index({ sku: 1, createdAt: -1 });

inventoryMovementSchema.plugin(toJSON);

export default mongoose.models.InventoryMovement ||
  mongoose.model("InventoryMovement", inventoryMovementSchema);
