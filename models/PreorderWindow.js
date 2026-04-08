import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const windowItemSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
  },
  { _id: false }
);

const deliveryBandSchema = mongoose.Schema(
  {
    minDistanceKm: {
      type: Number,
      min: 0,
      default: 0,
    },
    maxDistanceKm: {
      type: Number,
      min: 0,
      required: true,
    },
    fee: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const preorderWindowSchema = mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ["draft", "open", "closed", "archived"],
      default: "draft",
    },
    opensAt: {
      type: Date,
      default: null,
    },
    closesAt: {
      type: Date,
      default: null,
    },
    deliveryDate: {
      type: Date,
      required: true,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
    },
    minimumOrderQuantity: {
      type: Number,
      min: 1,
      default: 4,
    },
    pickupAddress: {
      type: String,
      trim: true,
      default: "",
    },
    pickupDoorNumber: {
      type: String,
      trim: true,
      default: "",
    },
    allowFreePickup: {
      type: Boolean,
      default: false,
    },
    deliveryBands: {
      type: [deliveryBandSchema],
      default: [],
    },
    freeDeliveryThreshold: {
      type: Number,
      min: 0,
      default: null,
    },
    driverPayoutPerKm: {
      type: Number,
      min: 0,
      default: 0,
    },
    allowedItems: {
      type: [windowItemSchema],
      default: [],
    },
    allowCustomerNotes: {
      type: Boolean,
      default: true,
    },
    deliveryRouteSnapshot: {
      type: {
        status: {
          type: String,
          enum: ["idle", "ready", "error"],
          default: "idle",
        },
        generatedAt: {
          type: Date,
          default: null,
        },
        originAddress: {
          type: String,
          trim: true,
          default: "",
        },
        totalStops: {
          type: Number,
          min: 0,
          default: 0,
        },
        totalDistanceKm: {
          type: Number,
          min: 0,
          default: 0,
        },
        driverPayout: {
          type: Number,
          min: 0,
          default: 0,
        },
        payoutPerKm: {
          type: Number,
          min: 0,
          default: 0,
        },
        error: {
          type: String,
          trim: true,
          default: "",
        },
        stops: {
          type: [
            {
              _id: false,
              stopNumber: Number,
              preorderId: String,
              customerName: String,
              phone: String,
              email: String,
              address: String,
              totalQuantity: Number,
              total: Number,
              status: String,
              deliveredAt: Date,
              legDistanceKm: Number,
              cumulativeDistanceKm: Number,
              mapsUrl: String,
              items: {
                type: [
                  {
                    _id: false,
                    sku: String,
                    productName: String,
                    quantity: Number,
                  },
                ],
                default: [],
              },
            },
          ],
          default: [],
        },
      },
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

preorderWindowSchema.plugin(toJSON);

export default mongoose.models.PreorderWindow ||
  mongoose.model("PreorderWindow", preorderWindowSchema);
