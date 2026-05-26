import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const geoPerkBenefitSchema = mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["delivery_fee"],
      default: "delivery_fee",
    },
    mode: {
      type: String,
      enum: ["waive"],
      default: "waive",
    },
  },
  { _id: false }
);

const geoPerkSchema = mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    areaLabel: {
      type: String,
      trim: true,
      required: true,
    },
    matchTerms: {
      type: [String],
      default: [],
    },
    excludeTerms: {
      type: [String],
      default: [],
    },
    benefits: {
      type: [geoPerkBenefitSchema],
      default: () => [{ type: "delivery_fee", mode: "waive" }],
    },
    customerMessage: {
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

geoPerkSchema.plugin(toJSON);

export default mongoose.models.GeoPerk || mongoose.model("GeoPerk", geoPerkSchema);
