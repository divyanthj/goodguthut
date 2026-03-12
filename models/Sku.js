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
    unitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

skuSchema.plugin(toJSON);

export default mongoose.models.Sku || mongoose.model("Sku", skuSchema);
