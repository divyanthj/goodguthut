import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const recipeIngredientSchema = mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    quantity: {
      type: Number,
      min: 0,
      required: true,
    },
    unit: {
      type: String,
      trim: true,
      required: true,
    },
    toleranceType: {
      type: String,
      enum: ["exact", "plus_minus"],
      default: "exact",
    },
    toleranceValue: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const recipeParserMetadataSchema = mongoose.Schema(
  {
    provider: {
      type: String,
      trim: true,
      default: "",
    },
    model: {
      type: String,
      trim: true,
      default: "",
    },
    parsedAt: {
      type: Date,
      default: null,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    unresolvedFields: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const recipeFormulaSchema = mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      index: true,
    },
    skuName: {
      type: String,
      trim: true,
      required: true,
    },
    baseYieldLitres: {
      type: Number,
      min: 0.01,
      required: true,
    },
    ingredients: {
      type: [recipeIngredientSchema],
      default: [],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "At least one ingredient is required.",
      },
    },
    status: {
      type: String,
      enum: ["draft", "approved", "archived"],
      default: "draft",
      index: true,
    },
    sourceType: {
      type: String,
      enum: ["manual", "sop_snapshot"],
      default: "manual",
    },
    version: {
      type: Number,
      min: 1,
      required: true,
    },
    approvedBy: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    parser: {
      type: recipeParserMetadataSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

recipeFormulaSchema.index({ sku: 1, version: 1 }, { unique: true });
recipeFormulaSchema.plugin(toJSON);

export default mongoose.models.RecipeFormula ||
  mongoose.model("RecipeFormula", recipeFormulaSchema);
