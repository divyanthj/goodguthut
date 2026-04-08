import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const subscriptionComboItemSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    quantity: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
  },
  { _id: false }
);

const totalQuantityValidator = (items = []) =>
  Array.isArray(items) &&
  items.reduce((sum, item) => sum + Number(item?.quantity || 0), 0) >= 4 &&
  items.reduce((sum, item) => sum + Number(item?.quantity || 0), 0) <= 10;

const subscriptionComboSchema = mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "draft", "archived"],
      default: "draft",
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    items: {
      type: [subscriptionComboItemSchema],
      default: [],
      validate: {
        validator: totalQuantityValidator,
        message: "Subscription combos must contain between 4 and 10 bottles.",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

subscriptionComboSchema.plugin(toJSON);

export default mongoose.models.SubscriptionCombo ||
  mongoose.model("SubscriptionCombo", subscriptionComboSchema);
