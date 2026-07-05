import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const discountCodeGrantSchema = mongoose.Schema(
  {
    discountCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscountCode",
      required: true,
      index: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      required: true,
    },
    phoneKey: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["retention_nudge"],
      default: "retention_nudge",
    },
    sourceType: {
      type: String,
      trim: true,
      default: "",
    },
    sourceId: {
      type: String,
      trim: true,
      default: "",
    },
    lastGrantedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

discountCodeGrantSchema.index(
  { discountCode: 1, phoneKey: 1, source: 1 },
  { unique: true }
);

discountCodeGrantSchema.plugin(toJSON);

export default mongoose.models.DiscountCodeGrant ||
  mongoose.model("DiscountCodeGrant", discountCodeGrantSchema);
