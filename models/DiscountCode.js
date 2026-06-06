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
    campaignType: {
      type: String,
      enum: ["general", "weekly_offer", "birthday", "winback"],
      default: "general",
    },
    campaignName: {
      type: String,
      trim: true,
      default: "",
    },
    startsAt: {
      type: Date,
      default: null,
    },
    isPerpetual: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    maxRedemptions: {
      type: Number,
      min: 0,
      default: 0,
    },
    redemptionCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
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
