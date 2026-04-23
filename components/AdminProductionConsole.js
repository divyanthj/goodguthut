"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const formatQty = (value, decimals = 2) => Number(value || 0).toFixed(decimals);
const RECIPE_UNIT_OPTIONS = ["g", "kg", "ml", "litre", "tsp", "tbsp", "pinch", "piece"];

const createEmptyIngredient = () => ({
  name: "",
  quantity: 0,
  unit: "",
  toleranceType: "exact",
  toleranceValue: 0,
});

const createEmptyManualRecipe = () => ({
  id: "",
  sku: "",
  skuName: "",
  baseYieldLitres: 1,
  ingredients: [createEmptyIngredient()],
});

const formatTolerance = (ingredient) => {
  if (ingredient.toleranceType !== "plus_minus") {
    return "Exact";
  }

  return `+/- ${formatQty(ingredient.toleranceValue, 2)} ${ingredient.unit}`;
};

const toBatchSkuToken = (sku = "") => {
  const normalized = String(sku || "")
    .trim()
    .toUpperCase()
    .replace(/^GGH[-_]?/, "")
    .replace(/[^A-Z0-9]/g, "");

  return normalized || "NA";
};

const buildSharedBatchNumber = (sheet) => {
  const deliveryDate = String(sheet?.deliveryDate || "").trim();

  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return "";
  }

  const year = deliveryDate.slice(2, 4);
  const month = deliveryDate.slice(5, 7);
  const monthSequence = Math.max(1, Number(sheet?.summary?.batchSequenceInMonth || 1));
  const monthSequencePart = String(monthSequence).padStart(2, "0");
  const sharedSku = toBatchSkuToken(sheet?.ingredientsBySku?.[0]?.sku || "");

  return `${sharedSku}${year}${month}${monthSequencePart}`;
};

const shiftDateKey = (dateKey = "", deltaDays = 0) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "").trim())) {
    return "";
  }

  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0));

  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
};

export default function AdminProductionConsole() {
  const [sheet, setSheet] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [skuCatalog, setSkuCatalog] = useState([]);
  const [manualRecipe, setManualRecipe] = useState(createEmptyManualRecipe);
  const [sopSku, setSopSku] = useState("");
  const [sopSkuName, setSopSkuName] = useState("");
  const [sopFile, setSopFile] = useState(null);
  const [lastSopSuggestion, setLastSopSuggestion] = useState(null);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isImportingSop, setIsImportingSop] = useState(false);
  const [approvingRecipeId, setApprovingRecipeId] = useState("");
  const [isEditingApprovedVersion, setIsEditingApprovedVersion] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadIngredientSheet = useCallback(async () => {
    setIsLoadingSheet(true);
    setError("");

    try {
      const response = await fetch("/api/admin/production/ingredient-sheet", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load ingredient sheet.");
      }

      setSheet(data);
    } catch (loadError) {
      setError(loadError.message || "Could not load ingredient sheet.");
    } finally {
      setIsLoadingSheet(false);
    }
  }, []);

  const loadRecipes = useCallback(async () => {
    setIsLoadingRecipes(true);
    setError("");

    try {
      const response = await fetch("/api/admin/recipes", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load recipes.");
      }

      setRecipes(data.recipes || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load recipes.");
    } finally {
      setIsLoadingRecipes(false);
    }
  }, []);

  const loadSkuCatalog = useCallback(async () => {
    setError("");

    try {
      const response = await fetch("/api/admin/skus", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load SKU catalog.");
      }

      setSkuCatalog(data.skuCatalog || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load SKU catalog.");
    }
  }, []);

  useEffect(() => {
    loadIngredientSheet();
  }, [loadIngredientSheet]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  useEffect(() => {
    loadSkuCatalog();
  }, [loadSkuCatalog]);

  const printSkuCards = useMemo(() => {
    const skuItems = sheet?.ingredientsBySku || [];
    const pageSize = 6;
    const orderedForPriority = [...skuItems].sort((left, right) => {
      const rightVolume = Number(right.plannedLitres || right.targetLitres || 0);
      const leftVolume = Number(left.plannedLitres || left.targetLitres || 0);

      if (rightVolume !== leftVolume) {
        return rightVolume - leftVolume;
      }

      return Number(right.weeklyEquivalentBottles || 0) - Number(left.weeklyEquivalentBottles || 0);
    });
    const cards = orderedForPriority.slice(0, pageSize);

    if (cards.length > 0 && cards.length < pageSize) {
      const needed = pageSize - cards.length;

      for (let index = 0; index < needed; index += 1) {
        cards.push(orderedForPriority[index % orderedForPriority.length]);
      }
    }

    return cards;
  }, [sheet]);
  const sharedBatchNumber = useMemo(() => buildSharedBatchNumber(sheet), [sheet]);
  const printStartDate = useMemo(() => {
    const deliveryDate = String(sheet?.deliveryDate || "").trim();
    const minimumLeadDays = Math.max(0, Number(sheet?.summary?.minimumLeadDays || 0));
    return shiftDateKey(deliveryDate, -minimumLeadDays);
  }, [sheet]);

  const groupedRecipes = useMemo(() => {
    const groups = new Map();

    recipes.forEach((recipe) => {
      const existing = groups.get(recipe.sku) || {
        sku: recipe.sku,
        skuName: recipe.skuName,
        versions: [],
      };
      existing.versions.push(recipe);
      groups.set(recipe.sku, existing);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        versions: group.versions.sort((left, right) => Number(right.version || 0) - Number(left.version || 0)),
      }))
      .sort((left, right) => left.skuName.localeCompare(right.skuName));
  }, [recipes]);

  const updateManualIngredient = (index, key, value) => {
    setManualRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient, ingredientIndex) =>
        ingredientIndex === index ? { ...ingredient, [key]: value } : ingredient
      ),
    }));
  };

  const addManualIngredient = () => {
    setManualRecipe((current) => ({
      ...current,
      ingredients: [...current.ingredients, createEmptyIngredient()],
    }));
  };

  const removeManualIngredient = (index) => {
    setManualRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
    }));
  };

  const saveManualRecipe = async (event) => {
    event.preventDefault();
    setIsSavingManual(true);
    setError("");
    setMessage("");

    try {
      const isEditingDraft = Boolean(manualRecipe.id) && !isEditingApprovedVersion;
      const response = await fetch(isEditingDraft ? `/api/admin/recipes/${manualRecipe.id}` : "/api/admin/recipes", {
        method: isEditingDraft ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualRecipe),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save recipe draft.");
      }

      setMessage(
        isEditingDraft
          ? `Draft updated for ${data.recipe.sku} v${data.recipe.version}.`
          : `Draft saved for ${data.recipe.sku}.`
      );
      setManualRecipe(createEmptyManualRecipe());
      setIsEditingApprovedVersion(false);
      await Promise.all([loadRecipes(), loadIngredientSheet()]);
    } catch (saveError) {
      setError(saveError.message || "Could not save recipe draft.");
    } finally {
      setIsSavingManual(false);
    }
  };

  const startEditRecipe = (recipe) => {
    const selectedSku = skuCatalog.find((item) => item.sku === recipe.sku);

    setManualRecipe({
      id: recipe.status === "draft" ? recipe.id : "",
      sku: recipe.sku,
      skuName: selectedSku?.name || recipe.skuName || "",
      baseYieldLitres: Number(recipe.baseYieldLitres || 1),
      ingredients: (recipe.ingredients || []).map((ingredient) => ({
        name: String(ingredient.name || ""),
        quantity: Number(ingredient.quantity || 0),
        unit: String(ingredient.unit || ""),
        toleranceType: ingredient.toleranceType === "plus_minus" ? "plus_minus" : "exact",
        toleranceValue: Number(ingredient.toleranceValue || 0),
      })),
    });
    setIsEditingApprovedVersion(recipe.status !== "draft");
    setMessage(
      recipe.status === "draft"
        ? `Editing draft ${recipe.sku} v${recipe.version}.`
        : `Loaded ${recipe.sku} v${recipe.version}. Saving will create a new draft version.`
    );
    setError("");
  };

  const cancelEditRecipe = () => {
    setManualRecipe(createEmptyManualRecipe());
    setIsEditingApprovedVersion(false);
    setMessage("Recipe form reset.");
    setError("");
  };

  const approveRecipe = async (id) => {
    setApprovingRecipeId(id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/recipes/${id}/approve`, {
        method: "PATCH",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not approve recipe.");
      }

      setMessage(`Approved ${data.recipe.sku} v${data.recipe.version}.`);
      await Promise.all([loadRecipes(), loadIngredientSheet()]);
    } catch (approvalError) {
      setError(approvalError.message || "Could not approve recipe.");
    } finally {
      setApprovingRecipeId("");
    }
  };

  const importSop = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!sopFile) {
      setError("Choose an SOP snapshot image first.");
      return;
    }

    setIsImportingSop(true);

    try {
      const formData = new FormData();
      formData.append("file", sopFile);
      formData.append("sku", sopSku);
      formData.append("skuName", sopSkuName);

      const response = await fetch("/api/admin/recipes/import-sop", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not import SOP snapshot.");
      }

      setLastSopSuggestion(data.suggestion || null);
      setSopFile(null);
      setMessage(
        `SOP parsed into draft for ${data.recipe.sku} v${data.recipe.version}. Review and approve before production use.`
      );
      await loadRecipes();
    } catch (importError) {
      setError(importError.message || "Could not import SOP snapshot.");
    } finally {
      setIsImportingSop(false);
    }
  };

  const handleExportPdf = () => {
    if (!sheet?.ingredientsBySku?.length) {
      setError("No SKU sheets available to export yet.");
      return;
    }

    setMessage("Opening print dialog. Choose Save as PDF.");
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="alert alert-success">
          <span>{message}</span>
        </div>
      )}

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Next delivery production snapshot</h2>
            <p className="mt-1 text-sm opacity-75">
              Auto-calculated from all committed orders for the next delivery date. Bottle size fixed at 200 ml.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={loadIngredientSheet} disabled={isLoadingSheet}>
            {isLoadingSheet ? "Loading..." : "Refresh"}
          </button>
        </div>

        {sheet && (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-base-200 p-4 text-sm">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Next delivery date</div>
                <div className="mt-2 text-lg font-semibold">
                  {sheet.deliveryDate || "-"}
                </div>
              </div>
              <div className="rounded-xl bg-base-200 p-4 text-sm">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Committed orders</div>
                <div className="mt-2 text-2xl font-semibold">{sheet.summary?.committedOrderCount || 0}</div>
              </div>
              <div className="rounded-xl bg-base-200 p-4 text-sm">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Total bottles to produce</div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatQty(sheet.summary?.totalBottles, 2)}
                </div>
              </div>
              <div className="rounded-xl bg-base-200 p-4 text-sm">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Order source mix</div>
                <div className="mt-2 text-2xl font-semibold">
                  S {sheet.summary?.subscriptionCount || 0} / R {sheet.summary?.recurringOrderPlanCount || 0}
                </div>
                <div className="text-xs opacity-70">
                  O {sheet.summary?.oneTimeOrderPlanCount || 0} / P {sheet.summary?.preorderCount || 0}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ingredient sheet</h2>
            <p className="mt-1 text-sm opacity-75">
              Consolidated totals and per-SKU requirements for production.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportPdf}
              disabled={!sheet?.ingredientsBySku?.length}
            >
              Export as PDF
            </button>
            <div className="text-xs opacity-70">Use Save as PDF in the print dialog.</div>
          </div>
        </div>

        {sheet?.missingRecipes?.length > 0 && (
          <div className="alert alert-warning mt-4">
            <span>
              Missing approved recipes for:{" "}
              {sheet.missingRecipes.map((item) => `${item.productName} (${item.sku})`).join(", ")}
            </span>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 text-sm font-medium">Consolidated ingredients</div>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Unit</th>
                <th className="text-right">Quantity</th>
                <th>Tolerance</th>
              </tr>
            </thead>
            <tbody>
              {(sheet?.consolidatedIngredients || []).length > 0 ? (
                sheet.consolidatedIngredients.map((ingredient, index) => (
                  <tr key={`consolidated-${ingredient.name}-${index}`}>
                    <td>{ingredient.name}</td>
                    <td>{ingredient.unit}</td>
                    <td className="text-right font-medium">{formatQty(ingredient.quantity, 2)}</td>
                    <td>{formatTolerance(ingredient)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-6 text-center opacity-70">
                    No consolidated ingredients yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {(sheet?.ingredientsBySku || []).map((skuEntry) => (
            <div key={`sku-sheet-${skuEntry.sku}`} className="rounded-xl bg-base-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{skuEntry.skuName}</div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">{skuEntry.sku}</div>
                </div>
                <div className="text-right text-sm">
                  <div>{formatQty(skuEntry.weeklyEquivalentBottles, 2)} bottles (next delivery)</div>
                  <div>Demand: {formatQty(skuEntry.targetLitres, 2)} L</div>
                  <div>Planned: {formatQty(skuEntry.plannedLitres, 2)} L</div>
                  <div>Wastage buffer: {formatQty(skuEntry.wastageLitres, 2)} L</div>
                  <div className="opacity-70">recipe v{skuEntry.formulaVersion}</div>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th>Unit</th>
                      <th className="text-right">Qty</th>
                      <th>Tolerance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuEntry.ingredients.map((ingredient, index) => (
                      <tr key={`${skuEntry.sku}-${ingredient.name}-${index}`}>
                        <td>{ingredient.name}</td>
                        <td>{ingredient.unit}</td>
                        <td className="text-right font-medium">{formatQty(ingredient.quantity, 2)}</td>
                        <td>{formatTolerance(ingredient)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <h2 className="text-xl font-semibold">Recipe manager</h2>
        <p className="mt-1 text-sm opacity-75">Create recipe drafts, track versions, and approve the one used for production.</p>

        <form onSubmit={saveManualRecipe} className="mt-4 rounded-xl bg-base-200 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="form-control">
              <div className="label py-0">
                <span className="label-text">SKU</span>
              </div>
              <select
                className="select select-bordered"
                value={manualRecipe.sku}
                onChange={(event) =>
                  setManualRecipe((current) => {
                    const nextSku = event.target.value;
                    const selectedSku = skuCatalog.find((item) => item.sku === nextSku);

                    return {
                      ...current,
                      sku: nextSku,
                      skuName: selectedSku?.name || "",
                    };
                  })
                }
              >
                <option value="">Select SKU</option>
                {skuCatalog
                  .filter((item) => item.status === "active")
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .map((item) => (
                    <option key={item.id} value={item.sku}>
                      {item.name} ({item.sku})
                    </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <div className="label py-0">
                <span className="label-text">Base yield (litres)</span>
              </div>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input input-bordered"
                value={manualRecipe.baseYieldLitres}
                onChange={(event) =>
                  setManualRecipe((current) => ({
                    ...current,
                    baseYieldLitres: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {manualRecipe.ingredients.map((ingredient, index) => (
              <div key={`manual-ingredient-${index}`} className="rounded-xl border border-base-300 bg-base-100 p-3">
                <div className="grid gap-2 md:grid-cols-8">
                  <input
                    className="input input-bordered md:col-span-3"
                    placeholder="Ingredient"
                    value={ingredient.name}
                    onChange={(event) => updateManualIngredient(index, "name", event.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input input-bordered md:col-span-2"
                    placeholder="Quantity"
                    value={ingredient.quantity}
                    onChange={(event) => updateManualIngredient(index, "quantity", Number(event.target.value || 0))}
                  />
                  <select
                    className="select select-bordered md:col-span-3"
                    value={ingredient.unit}
                    onChange={(event) => updateManualIngredient(index, "unit", event.target.value)}
                  >
                    <option value="">Select unit</option>
                    {RECIPE_UNIT_OPTIONS.map((unitOption) => (
                      <option key={`unit-${unitOption}`} value={unitOption}>
                        {unitOption}
                      </option>
                    ))}
                  </select>

                  <div className="md:col-span-8 flex flex-wrap items-end justify-between gap-2">
                    <label className="label cursor-pointer justify-start gap-2 p-0">
                      <input
                        type="checkbox"
                        className="toggle toggle-sm"
                        checked={ingredient.toleranceType !== "plus_minus"}
                        onChange={(event) =>
                          updateManualIngredient(
                            index,
                            "toleranceType",
                            event.target.checked ? "exact" : "plus_minus"
                          )
                        }
                      />
                      <span className="label-text">Exact</span>
                    </label>

                    <div className="flex flex-wrap items-end gap-2">
                      {ingredient.toleranceType === "plus_minus" && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="input input-bordered w-36"
                          placeholder="+/- value"
                          value={ingredient.toleranceValue}
                          onChange={(event) =>
                            updateManualIngredient(index, "toleranceValue", Number(event.target.value || 0))
                          }
                        />
                      )}

                      <button
                        type="button"
                        className="btn btn-outline btn-error"
                        onClick={() => removeManualIngredient(index)}
                        disabled={manualRecipe.ingredients.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline" onClick={addManualIngredient}>
              Add ingredient
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSavingManual}>
              {isSavingManual
                ? "Saving..."
                : manualRecipe.id
                  ? "Update draft recipe"
                  : "Save draft recipe"}
            </button>
            {(manualRecipe.id || isEditingApprovedVersion) && (
              <button type="button" className="btn btn-ghost" onClick={cancelEditRecipe}>
                Cancel edit
              </button>
            )}
          </div>
        </form>

        <div className="mt-5 space-y-3">
          {isLoadingRecipes ? (
            <div className="rounded-xl bg-base-200 p-4 text-sm opacity-70">Loading recipes...</div>
          ) : groupedRecipes.length === 0 ? (
            <div className="rounded-xl bg-base-200 p-4 text-sm opacity-70">No recipes yet.</div>
          ) : (
            groupedRecipes.map((group) => (
              <div key={`recipe-group-${group.sku}`} className="rounded-xl border border-base-300 bg-base-100 p-4">
                <div className="mb-2">
                  <div className="font-semibold">{group.skuName}</div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">{group.sku}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Source</th>
                        <th>Base yield</th>
                        <th>Updated</th>
                        <th>Approved by</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.versions.map((recipe) => (
                        <tr key={recipe.id}>
                          <td>v{recipe.version}</td>
                          <td>{recipe.status}</td>
                          <td>{recipe.sourceType}</td>
                          <td>{formatQty(recipe.baseYieldLitres, 2)} L</td>
                          <td>{new Date(recipe.updatedAt).toLocaleString("en-IN")}</td>
                          <td>{recipe.approvedBy || "-"}</td>
                          <td className="text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="btn btn-outline btn-xs"
                                onClick={() => startEditRecipe(recipe)}
                              >
                                {recipe.status === "draft" ? "Edit" : "Edit as draft"}
                              </button>
                              {recipe.status !== "approved" ? (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs"
                                  onClick={() => approveRecipe(recipe.id)}
                                  disabled={approvingRecipeId === recipe.id}
                                >
                                  {approvingRecipeId === recipe.id ? "Approving..." : "Approve"}
                                </button>
                              ) : (
                                <span className="badge badge-success">Active</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <h2 className="text-xl font-semibold">SOP snapshot import</h2>
        <p className="mt-1 text-sm opacity-75">
          Upload an SOP image to generate a recipe draft. Images are parsed in memory and not stored.
        </p>

        <form onSubmit={importSop} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="form-control">
            <div className="label py-0">
              <span className="label-text">SKU (optional)</span>
            </div>
            <input
              className="input input-bordered"
              value={sopSku}
              onChange={(event) => setSopSku(event.target.value.toUpperCase())}
            />
          </label>
          <label className="form-control">
            <div className="label py-0">
              <span className="label-text">SKU name (optional)</span>
            </div>
            <input
              className="input input-bordered"
              value={sopSkuName}
              onChange={(event) => setSopSkuName(event.target.value)}
            />
          </label>
          <label className="form-control md:col-span-2">
            <div className="label py-0">
              <span className="label-text">SOP snapshot image</span>
            </div>
            <input
              type="file"
              accept="image/*"
              className="file-input file-input-bordered"
              onChange={(event) => setSopFile(event.target.files?.[0] || null)}
            />
          </label>

          <div className="md:col-span-4">
            <button type="submit" className="btn btn-primary" disabled={isImportingSop}>
              {isImportingSop ? "Parsing SOP..." : "Parse SOP and create draft"}
            </button>
          </div>
        </form>

        {lastSopSuggestion && (
          <div className="mt-4 rounded-xl bg-base-200 p-4">
            <div className="font-medium">Last parsed suggestion</div>
            <div className="mt-2 text-sm">
              <div>
                SKU: <span className="font-medium">{lastSopSuggestion.sku || "-"}</span>
              </div>
              <div>
                Name: <span className="font-medium">{lastSopSuggestion.skuName || "-"}</span>
              </div>
              <div>
                Base yield: <span className="font-medium">{formatQty(lastSopSuggestion.baseYieldLitres, 2)} L</span>
              </div>
              <div>
                Confidence: <span className="font-medium">{formatQty(lastSopSuggestion.confidence, 2)}</span>
              </div>
              <div>
                Unresolved fields:{" "}
                <span className="font-medium">
                  {(lastSopSuggestion.unresolvedFields || []).length > 0
                    ? lastSopSuggestion.unresolvedFields.join(", ")
                    : "None"}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
      </div>

      <div id="production-print-root" className="hidden print:block">
        <section className="wall-sheet-page wall-sheet-page-grid">
          {[0, 1, 2, 3, 4, 5].map((slotIndex) => {
              const skuEntry = printSkuCards[slotIndex];

              if (!skuEntry) {
                return <article key={`print-empty-${slotIndex}`} className="wall-sheet-sku-card wall-sheet-sku-card-empty" />;
              }

              return (
                <article key={`print-sku-${skuEntry.sku}-${slotIndex}`} className="wall-sheet-sku-card">
                  <header className="wall-sheet-header">
                    <div className="wall-sheet-brand">
                      <img src="/images/logo.jpg" alt="GGH logo" className="wall-sheet-logo" />
                    </div>
                    <div className="wall-sheet-title">{skuEntry.skuName}</div>
                    <div className="wall-sheet-subtitle">SKU: {skuEntry.sku}</div>
                    <div className="wall-sheet-meta-grid">
                      <div>Start Date: {printStartDate || "_____"}</div>
                      <div>End Date: _____</div>
                      <div>Start Time: _____</div>
                      <div>End Time: _____</div>
                      <div className="wall-sheet-meta-span-2">
                        Bottles (ordered/planned): {formatQty(skuEntry.weeklyEquivalentBottles, 0)}/{formatQty((Number(skuEntry.plannedLitres || 0) * 1000) / Number(sheet?.bottleSizeMl || 200), 0)}
                      </div>
                      <div className="wall-sheet-meta-span-2">
                        Planned Qty: {formatQty(skuEntry.plannedLitres, 2)} L
                      </div>
                      <div className="wall-sheet-meta-span-2">Batch Number: {sharedBatchNumber || "-"}</div>
                    </div>
                  </header>

                  <div className="wall-sheet-ingredients">
                    {skuEntry.ingredients.map((ingredient, index) => (
                      <div key={`print-ingredient-${skuEntry.sku}-${index}`} className="wall-sheet-ingredient-row">
                        <div className="wall-sheet-check-box" aria-hidden="true" />
                        <div className="wall-sheet-ingredient-name">{ingredient.name}</div>
                        <div className="wall-sheet-ingredient-qty">{formatQty(ingredient.quantity, 2)} {ingredient.unit}</div>
                        <div className="wall-sheet-ingredient-tolerance">
                          {ingredient.toleranceType === "plus_minus"
                            ? `+/- ${formatQty(ingredient.toleranceValue, 2)} ${ingredient.unit}`
                            : "Exact"}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
        </section>
      </div>
    </div>
  );
}
