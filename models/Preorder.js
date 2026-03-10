import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const preorderItemSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    productName: {
      type: String,
      trim: true,
      required: true,
    },
    quantity: {
      type: Number,
      min: 1,
      required: true,
    },
    quantityNotes: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
  },
  { _id: false }
);

const preorderSchema = mongoose.Schema(
  {
    customerName: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
    },
    phone: {
      type: String,
      trim: true,
      required: true,
    },
    address: {
      type: String,
      trim: true,
      required: true,
    },
    items: {
      type: [preorderItemSchema],
      default: [],
      validate: {
        validator: (value) => value.length > 0,
        message: "At least one preorder item is required",
      },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "fulfilled"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

preorderSchema.plugin(toJSON);

export default mongoose.models.Preorder ||
  mongoose.model("Preorder", preorderSchema);
