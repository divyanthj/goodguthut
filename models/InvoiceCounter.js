import mongoose from "mongoose";

const invoiceCounterSchema = mongoose.Schema(
  {
    key: {
      type: String,
      trim: true,
      required: true,
      unique: true,
    },
    sequence: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.InvoiceCounter ||
  mongoose.model("InvoiceCounter", invoiceCounterSchema);
