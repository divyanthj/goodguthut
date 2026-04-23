export const normalizeToleranceType = (value = "") =>
  value === "plus_minus" ? "plus_minus" : "exact";

export const normalizeRecipeIngredients = (ingredients = []) =>
  (Array.isArray(ingredients) ? ingredients : [])
    .map((ingredient) => ({
      name: String(ingredient?.name || "").trim(),
      quantity: Math.max(0, Number(ingredient?.quantity || 0)),
      unit: String(ingredient?.unit || "").trim(),
      toleranceType: normalizeToleranceType(ingredient?.toleranceType || ""),
      toleranceValue: Math.max(0, Number(ingredient?.toleranceValue || 0)),
    }))
    .filter((ingredient) => ingredient.name && ingredient.unit && ingredient.quantity > 0);

export const normalizeRecipeFormulaPayload = (body = {}, options = {}) => {
  const ingredients = normalizeRecipeIngredients(body.ingredients || []);
  const sourceType = body.sourceType === "sop_snapshot" ? "sop_snapshot" : "manual";

  return {
    sku: String(body.sku || "").trim().toUpperCase(),
    skuName: String(body.skuName || "").trim(),
    baseYieldLitres: Math.max(0, Number(body.baseYieldLitres || 0)),
    ingredients,
    sourceType: options.sourceType || sourceType,
  };
};

export const getNextRecipeVersion = async (RecipeFormulaModel, sku = "") => {
  const latest = await RecipeFormulaModel.findOne({ sku }).sort({ version: -1 });
  return Number(latest?.version || 0) + 1;
};

export const validateRecipeFormulaPayload = (payload = {}) => {
  if (!payload.sku) {
    return "SKU is required.";
  }

  if (!payload.skuName) {
    return "SKU name is required.";
  }

  if (!(payload.baseYieldLitres > 0)) {
    return "Base yield (litres) must be greater than 0.";
  }

  if (!Array.isArray(payload.ingredients) || payload.ingredients.length === 0) {
    return "At least one ingredient is required.";
  }

  return "";
};

export const serializeRecipeFormula = (recipe) =>
  recipe?.toJSON ? recipe.toJSON() : recipe;
