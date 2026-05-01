import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const invoiceItemSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    productName: {
      type: String,
      trim: true,
      required: true,
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    unitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    lineTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    hsnCode: {
      type: String,
      trim: true,
      default: "",
    },
    gstRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    taxableAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    cgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    igstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const invoiceCustomerSchema = mongoose.Schema(
  {
    name: {
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
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    addressLine2: {
      type: String,
      trim: true,
      default: "",
    },
    placeId: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    stateCode: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const invoiceSellerSchema = mongoose.Schema(
  {
    legalName: {
      type: String,
      trim: true,
      default: "The Living Element LLP",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    stateCode: {
      type: String,
      trim: true,
      default: "",
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
  },
  { _id: false }
);

const invoiceTaxSummarySchema = mongoose.Schema(
  {
    taxableAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    cgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    igstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalTaxAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    placeOfSupply: {
      type: String,
      trim: true,
      default: "",
    },
    placeOfSupplyStateCode: {
      type: String,
      trim: true,
      default: "",
    },
    gstTreatment: {
      type: String,
      enum: ["not_configured", "unknown_place", "intra_state", "inter_state"],
      default: "not_configured",
    },
  },
  { _id: false }
);

const invoiceDeliveryTaxSchema = mongoose.Schema(
  {
    hsnSac: {
      type: String,
      trim: true,
      default: "",
    },
    gstRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    taxableAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    cgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    igstAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const invoiceSourceSchema = mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["preorder", "order_plan", "subscription"],
      required: true,
    },
    id: {
      type: String,
      trim: true,
      required: true,
    },
    label: {
      type: String,
      trim: true,
      default: "",
    },
    deliveryKey: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { _id: false }
);

const invoiceSchema = mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      trim: true,
      required: true,
      unique: true,
    },
    sellerName: {
      type: String,
      trim: true,
      default: "The Living Element LLP",
    },
    seller: {
      type: invoiceSellerSchema,
      default: () => ({}),
    },
    invoiceLabel: {
      type: String,
      trim: true,
      default: "Invoice",
    },
    snapshotVersion: {
      type: Number,
      default: 1,
    },
    source: {
      type: invoiceSourceSchema,
      required: true,
    },
    customer: {
      type: invoiceCustomerSchema,
      default: () => ({}),
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
    },
    items: {
      type: [invoiceItemSchema],
      default: [],
    },
    subtotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    discountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryFee: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryTax: {
      type: invoiceDeliveryTaxSchema,
      default: () => ({}),
    },
    taxSummary: {
      type: invoiceTaxSummarySchema,
      default: () => ({}),
    },
    total: {
      type: Number,
      min: 0,
      default: 0,
    },
    grandTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    computerGeneratedText: {
      type: String,
      trim: true,
      default: "This is a computer-generated invoice.",
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "skipped", "failed"],
      default: "pending",
    },
    emailSentAt: {
      type: Date,
      default: null,
    },
    emailLastAttemptAt: {
      type: Date,
      default: null,
    },
    emailError: {
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

invoiceSchema.index(
  { "source.type": 1, "source.id": 1, "source.deliveryKey": 1 },
  { unique: true }
);
invoiceSchema.index({ invoiceDate: -1, createdAt: -1 });
invoiceSchema.index({ emailStatus: 1, updatedAt: -1 });

invoiceSchema.plugin(toJSON);

export default mongoose.models.Invoice ||
  mongoose.model("Invoice", invoiceSchema);
