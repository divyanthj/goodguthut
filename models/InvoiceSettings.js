import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const invoiceSettingsSchema = mongoose.Schema(
  {
    sellerLegalName: {
      type: String,
      trim: true,
      default: "The Living Element LLP",
    },
    sellerAddress: {
      type: String,
      trim: true,
      default: "",
    },
    sellerAddressLine2: {
      type: String,
      trim: true,
      default: "",
    },
    sellerPlaceId: {
      type: String,
      trim: true,
      default: "",
    },
    sellerState: {
      type: String,
      trim: true,
      default: "",
    },
    sellerStateCode: {
      type: String,
      trim: true,
      default: "",
    },
    sellerGstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    invoiceLabel: {
      type: String,
      trim: true,
      default: "Invoice",
    },
    deliveryHsnSac: {
      type: String,
      trim: true,
      default: "",
    },
    deliveryGstRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    computerGeneratedText: {
      type: String,
      trim: true,
      default: "This is a computer-generated invoice.",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

invoiceSettingsSchema.plugin(toJSON);

export default mongoose.models.InvoiceSettings ||
  mongoose.model("InvoiceSettings", invoiceSettingsSchema);
