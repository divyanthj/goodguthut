import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const customerNudgeSchema = mongoose.Schema(
  {
    customerKey: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    channel: {
      type: String,
      enum: ["email", "whatsapp"],
      required: true,
    },
    nudgeType: {
      type: String,
      trim: true,
      default: "personal",
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    subject: {
      type: String,
      trim: true,
      default: "",
    },
    message: {
      type: String,
      trim: true,
      required: true,
    },
    status: {
      type: String,
      enum: ["sent", "copied_and_opened", "failed"],
      required: true,
    },
    error: {
      type: String,
      trim: true,
      default: "",
    },
    orderCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastOrderAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

customerNudgeSchema.index({ customerKey: 1, sentAt: -1 });
customerNudgeSchema.plugin(toJSON);

export default mongoose.models.CustomerNudge ||
  mongoose.model("CustomerNudge", customerNudgeSchema);
