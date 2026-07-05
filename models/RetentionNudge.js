import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const retentionNudgeSchema = mongoose.Schema(
  {
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
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
    },
    discountCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscountCode",
      default: null,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    discountAmount: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    emailStatus: {
      type: String,
      enum: ["sent", "skipped", "failed"],
      default: "sent",
    },
    emailError: {
      type: String,
      trim: true,
      default: "",
    },
    lastOrderAt: {
      type: Date,
      default: null,
    },
    lastOrderTotal: {
      type: Number,
      min: 0,
      default: 0,
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
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

retentionNudgeSchema.plugin(toJSON);

export default mongoose.models.RetentionNudge ||
  mongoose.model("RetentionNudge", retentionNudgeSchema);
