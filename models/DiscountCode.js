import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const discountCodeSchema = mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    isPerpetual: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
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

discountCodeSchema.plugin(toJSON);

export default mongoose.models.DiscountCode ||
  mongoose.model("DiscountCode", discountCodeSchema);
