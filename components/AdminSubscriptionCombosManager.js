"use client";

import { useMemo, useRef, useState } from "react";

const createEmptyComboForm = () => ({
  id: "",
  name: "",
  description: "",
  status: "draft",
  sortOrder: 0,
  isFeatured: false,
  items: [],
});

const getTotalQuantity = (items = []) =>
  items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

export default function AdminSubscriptionCombosManager({
  initialCombos = [],
  initialSkuCatalog = [],
}) {
  const [combos, setCombos] = useState(initialCombos);
  const [skuCatalog, setSkuCatalog] = useState(initialSkuCatalog);
  const [comboForm, setComboForm] = useState(
    initialCombos[0]
      ? {
          id: initialCombos[0].id,
          name: initialCombos[0].name || "",
          description: initialCombos[0].description || "",
          status: initialCombos[0].status || "draft",
          sortOrder: Number(initialCombos[0].sortOrder || 0),
          isFeatured: initialCombos[0].isFeatured === true,
          items: (initialCombos[0].items || []).map((item) => ({
            sku: item.sku,
            quantity: Number(item.quantity || 0),
          })),
        }
      : createEmptyComboForm()
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const editorRef = useRef(null);

  const comboItemsMap = useMemo(
    () => new Map((comboForm.items || []).map((item) => [item.sku, Number(item.quantity || 0)])),
    [comboForm.items]
  );
  const availableSkus = useMemo(
    () => skuCatalog.filter((sku) => !comboItemsMap.has(sku.sku)),
    [comboItemsMap, skuCatalog]
  );
  const selectedSkus = useMemo(
    () =>
      (comboForm.items || [])
        .map((item) => ({
          ...item,
          skuData: skuCatalog.find((sku) => sku.sku === item.sku) || null,
        }))
        .filter((item) => item.skuData),
    [comboForm.items, skuCatalog]
  );

  const clearFeedback = () => {
    setMessage("");
    setError("");
  };

  const refreshData = async (preferredId = comboForm.id) => {
    const response = await fetch("/api/admin/subscription-combos", {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load subscription combos.");
    }

    setCombos(data.combos || []);
    setSkuCatalog(data.skuCatalog || []);

    const preferredCombo = (data.combos || []).find((combo) => combo.id === preferredId);

    if (preferredCombo) {
      setComboForm({
        id: preferredCombo.id,
        name: preferredCombo.name || "",
        description: preferredCombo.description || "",
        status: preferredCombo.status || "draft",
        sortOrder: Number(preferredCombo.sortOrder || 0),
        isFeatured: preferredCombo.isFeatured === true,
        items: (preferredCombo.items || []).map((item) => ({
          sku: item.sku,
          quantity: Number(item.quantity || 0),
        })),
      });
      return;
    }

    setComboForm(createEmptyComboForm());
  };

  const selectCombo = (combo) => {
    clearFeedback();
    setComboForm({
      id: combo.id,
      name: combo.name || "",
      description: combo.description || "",
      status: combo.status || "draft",
      sortOrder: Number(combo.sortOrder || 0),
      isFeatured: combo.isFeatured === true,
      items: (combo.items || []).map((item) => ({
        sku: item.sku,
        quantity: Number(item.quantity || 0),
      })),
    });
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const startNewCombo = () => {
    clearFeedback();
    setComboForm(createEmptyComboForm());
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const updateItemQuantity = (sku, quantity) => {
    setComboForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.sku === sku
          ? { ...item, quantity: Math.max(1, Math.min(10, Number(quantity || 1))) }
          : item
      ),
    }));
  };

  const addSku = (sku) => {
    setComboForm((current) => ({
      ...current,
      items: [...current.items, { sku, quantity: 1 }],
    }));
  };

  const removeSku = (sku) => {
    setComboForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.sku !== sku),
    }));
  };

  const onSave = async (event) => {
    event.preventDefault();
    clearFeedback();
    setIsSaving(true);

    try {
      const isEditing = Boolean(comboForm.id);
      const response = await fetch(
        isEditing
          ? `/api/admin/subscription-combos/${comboForm.id}`
          : "/api/admin/subscription-combos",
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(comboForm),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save box.");
      }

      await refreshData(data.combo?.id || comboForm.id);
      setMessage(isEditing ? "Box updated." : "Box created.");
    } catch (saveError) {
      setError(saveError.message || "Could not save box.");
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!comboForm.id || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this box permanently? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    clearFeedback();
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/subscription-combos/${comboForm.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete box.");
      }

      await refreshData("");
      setMessage("Box deleted.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete box.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Boxes</h2>
          <p className="text-sm opacity-70">
            Build fixed 4 to 10 bottle boxes that customers can choose at checkout.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={startNewCombo}>
          New box
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          {combos.length === 0 ? (
            <div className="rounded-2xl bg-base-200 p-4 text-sm opacity-75">
              No boxes yet. Create your first one to offer a curated option.
            </div>
          ) : (
            combos.map((combo) => {
              const isSelected = combo.id === comboForm.id;

              return (
                <button
                  key={combo.id}
                  type="button"
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-base-300 bg-base-100 hover:border-primary/40"
                  }`}
                  onClick={() => selectCombo(combo)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{combo.name}</div>
                      <div className="mt-1 text-xs opacity-70">
                        {combo.totalQuantity} bottle{combo.totalQuantity === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className={`badge ${combo.status === "active" ? "badge-success" : "badge-outline"}`}>
                      {combo.status}
                    </div>
                  </div>
                  <div className="mt-2 text-sm opacity-75">
                    {combo.description || "No description yet."}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs opacity-70">
                    {combo.isFeatured && <span className="badge badge-warning badge-outline">Featured</span>}
                    {!combo.isRecurringEligible && (
                      <span className="badge badge-outline">One-time only</span>
                    )}
                    <span>INR {Number(combo.subtotal || 0).toFixed(2)}</span>
                  </div>
                </button>
              );
            })
          )}
        </aside>

        <form ref={editorRef} onSubmit={onSave} className="rounded-2xl border border-base-300 bg-base-200 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="form-control md:col-span-2">
              <div className="label">
                <span className="label-text">Box name</span>
              </div>
              <input
                className="input input-bordered"
                value={comboForm.name}
                onChange={(event) =>
                  setComboForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>

            <label className="form-control">
              <div className="label">
                <span className="label-text">Status</span>
              </div>
              <select
                className="select select-bordered"
                value={comboForm.status}
                onChange={(event) =>
                  setComboForm((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            <label className="form-control">
              <div className="label">
                <span className="label-text">Sort order</span>
              </div>
              <input
                type="number"
                className="input input-bordered"
                value={comboForm.sortOrder}
                onChange={(event) =>
                  setComboForm((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value || 0),
                  }))
                }
              />
            </label>

            <label className="form-control md:col-span-2">
              <div className="label">
                <span className="label-text">Description</span>
              </div>
              <textarea
                className="textarea textarea-bordered"
                rows={3}
                value={comboForm.description}
                onChange={(event) =>
                  setComboForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="label mt-2 cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={comboForm.isFeatured}
              onChange={(event) =>
                setComboForm((current) => ({ ...current, isFeatured: event.target.checked }))
              }
            />
            <span className="label-text">Feature this box where recurring is available</span>
          </label>

          <div className="mt-5 rounded-2xl bg-base-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Box lineup</div>
                <div className="text-sm opacity-70">
                  Keep each combo between 4 and 10 bottles total.
                </div>
              </div>
              <div className="badge badge-outline">
                {getTotalQuantity(comboForm.items)} bottles
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {selectedSkus.length === 0 ? (
                <div className="rounded-xl bg-base-200 p-4 text-sm opacity-75">
                  No SKUs selected yet.
                </div>
              ) : (
                selectedSkus.map((item) => (
                  <div key={item.sku} className="grid gap-3 rounded-xl bg-base-200 p-4 md:grid-cols-[minmax(0,1fr)_120px_auto]">
                    <div>
                      <div className="font-medium">{item.skuData?.name || item.sku}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] opacity-60">
                        {item.sku}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] opacity-60">
                        {item.skuData?.skuType === "seasonal" ? "seasonal" : "perennial"}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="input input-bordered"
                      value={item.quantity}
                      onChange={(event) => updateItemQuantity(item.sku, event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost text-error"
                      onClick={() => removeSku(item.sku)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5">
              <div className="mb-3 text-sm font-medium opacity-75">Add from SKU catalog</div>
              <div className="grid gap-3 md:grid-cols-2">
                {availableSkus.map((sku) => (
                  <div key={sku.id} className="rounded-xl bg-base-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{sku.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] opacity-60">
                          {sku.sku}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={sku.status !== "active"}
                        onClick={() => addSku(sku.sku)}
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-2 text-sm opacity-75">{sku.notes || "No description yet."}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.16em] opacity-60">
                      {sku.skuType === "seasonal" ? "seasonal" : "perennial"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="submit" className="btn btn-primary" disabled={isSaving || isDeleting}>
              {isSaving ? "Saving..." : "Save box"}
            </button>
            <div className="flex items-center gap-2">
              {comboForm.id && (
                <button
                  type="button"
                  className="btn btn-outline btn-error"
                  onClick={onDelete}
                  disabled={isSaving || isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete box"}
                </button>
              )}
              {comboForm.id && <div className="badge badge-outline">Box ID: {comboForm.id}</div>}
            </div>
          </div>

          {message && (
            <div className="alert alert-success mt-4">
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="alert alert-error mt-4">
              <span>{error}</span>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
