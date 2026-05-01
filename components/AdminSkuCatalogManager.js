"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const createEmptySkuForm = () => ({
  id: "",
  sku: "",
  name: "",
  notes: "",
  unitPrice: 0,
  hsnCode: "",
  gstRate: 0,
  status: "active",
  isSeasonal: false,
  recurringCutoffDate: "",
});

const getDefaultSeasonalCutoffDate = (now = new Date()) => {
  const next = new Date(now);
  next.setMonth(next.getMonth() + 3);
  return next.toISOString().slice(0, 10);
};

export default function AdminSkuCatalogManager() {
  const [skuCatalog, setSkuCatalog] = useState([]);
  const [skuForm, setSkuForm] = useState(createEmptySkuForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editorRef = useRef(null);

  const activeCount = useMemo(
    () => skuCatalog.filter((item) => item.status === "active").length,
    [skuCatalog]
  );

  const refreshData = useCallback(async (preferredSkuId = "", options = {}) => {
    const showLoader = options.showLoader !== false;

    if (showLoader) {
      setIsLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/admin/skus", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load products.");
      }

      const nextCatalog = data.skuCatalog || [];
      setSkuCatalog(nextCatalog);

      if (!nextCatalog.length) {
        setSkuForm(createEmptySkuForm());
        return;
      }

      if (preferredSkuId) {
        const nextSku = nextCatalog.find((item) => item.id === preferredSkuId);
        if (nextSku) {
          setSkuForm({
            id: nextSku.id,
            sku: nextSku.sku,
            name: nextSku.name,
            notes: nextSku.notes || "",
            unitPrice: Number(nextSku.unitPrice || 0),
            hsnCode: nextSku.hsnCode || "",
            gstRate: Number(nextSku.gstRate || 0),
            status: nextSku.status || "active",
            isSeasonal:
              nextSku.isSeasonal === true || nextSku.skuType === "seasonal",
            recurringCutoffDate: String(nextSku.recurringCutoffDate || "").trim(),
          });
          return;
        }
      }

      const first = nextCatalog[0];
      setSkuForm({
        id: first.id,
        sku: first.sku,
        name: first.name,
        notes: first.notes || "",
        unitPrice: Number(first.unitPrice || 0),
        hsnCode: first.hsnCode || "",
        gstRate: Number(first.gstRate || 0),
        status: first.status || "active",
        isSeasonal: first.isSeasonal === true || first.skuType === "seasonal",
        recurringCutoffDate: String(first.recurringCutoffDate || "").trim(),
      });
    } catch (loadError) {
      setError(loadError.message || "Could not load products.");
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshData("");
  }, [refreshData]);

  const selectSku = (skuItem) => {
    setError("");
    setMessage("");
    setSkuForm({
      id: skuItem.id,
      sku: skuItem.sku,
      name: skuItem.name,
      notes: skuItem.notes || "",
      unitPrice: Number(skuItem.unitPrice || 0),
      hsnCode: skuItem.hsnCode || "",
      gstRate: Number(skuItem.gstRate || 0),
      status: skuItem.status || "active",
      isSeasonal: skuItem.isSeasonal === true || skuItem.skuType === "seasonal",
      recurringCutoffDate: String(skuItem.recurringCutoffDate || "").trim(),
    });

  };

  const startNewSku = () => {
    setError("");
    setMessage("");
    setSkuForm(createEmptySkuForm());
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const onSave = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);

    try {
      const isEditing = Boolean(skuForm.id);
      const response = await fetch(
        isEditing ? `/api/admin/skus/${skuForm.id}` : "/api/admin/skus",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...skuForm,
            isSeasonal: skuForm.isSeasonal === true,
            skuType: skuForm.isSeasonal === true ? "seasonal" : "perennial",
            recurringCutoffDate:
              skuForm.isSeasonal === true
                ? String(skuForm.recurringCutoffDate || "").trim()
                : "",
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save product.");
      }

      await refreshData(data.sku?.id || skuForm.id, { showLoader: false });
      setMessage(isEditing ? "Product updated." : "Product created.");
    } catch (saveError) {
      setError(saveError.message || "Could not save product.");
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!skuForm.id || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this product permanently? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/admin/skus/${skuForm.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete product.");
      }

      await refreshData("", { showLoader: false });
      setMessage("Product deleted.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete product.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Products</h2>
          <p className="text-sm opacity-75">
            Manage your full product catalog and mark seasonal items.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="badge badge-outline">{activeCount} active</div>
          <button type="button" className="btn btn-outline" onClick={startNewSku}>
            New product
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-2xl bg-base-200 p-4 text-sm opacity-70">Loading products...</div>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-3">
            {skuCatalog.length === 0 ? (
              <div className="rounded-2xl bg-base-200 p-4 text-sm opacity-75">
                No products yet. Create your first product.
              </div>
            ) : (
              skuCatalog.map((skuItem) => (
                <button
                  key={skuItem.id}
                  type="button"
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    skuForm.id === skuItem.id
                      ? "border-primary bg-primary/10"
                      : "border-base-300 bg-base-100 hover:border-primary/40"
                  }`}
                  onClick={() => selectSku(skuItem)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{skuItem.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] opacity-60">
                        {skuItem.sku}
                      </div>
                    </div>
                    <div className={`badge ${skuItem.status === "archived" ? "badge-outline" : "badge-success"}`}>
                      {skuItem.status}
                    </div>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.16em] opacity-70">
                    {skuItem.isSeasonal === true || skuItem.skuType === "seasonal"
                      ? "seasonal"
                      : "perennial"}
                  </div>
                  {(skuItem.isSeasonal === true || skuItem.skuType === "seasonal") &&
                    skuItem.recurringCutoffDate && (
                      <div className="mt-1 text-xs opacity-70">
                        Subscription end date: {skuItem.recurringCutoffDate}
                      </div>
                    )}
                  <div className="mt-2 text-sm opacity-75">{skuItem.notes || "No description yet."}</div>
                  <div className="mt-3 text-sm font-medium">INR {Number(skuItem.unitPrice || 0).toFixed(2)}</div>
                  <div className="mt-1 text-xs opacity-70">
                    HSN {skuItem.hsnCode || "-"} · GST {Number(skuItem.gstRate || 0)}%
                  </div>
                </button>
              ))
            )}
          </aside>

          <form
            ref={editorRef}
            onSubmit={onSave}
            className="rounded-2xl border border-base-300 bg-base-200 p-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control w-full">
                <div className="label"><span className="label-text">SKU code</span></div>
                <input
                  className="input input-bordered"
                  disabled={Boolean(skuForm.id)}
                  value={skuForm.sku}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, sku: event.target.value.toUpperCase() }))
                  }
                />
              </label>
              <label className="form-control w-full">
                <div className="label"><span className="label-text">Status</span></div>
                <select
                  className="select select-bordered"
                  value={skuForm.status}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <label className="label mt-2 cursor-pointer justify-start gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  className="toggle toggle-sm"
                  checked={skuForm.isSeasonal === true}
                  onChange={(event) =>
                    setSkuForm((current) => {
                      const nextIsSeasonal = event.target.checked;

                      return {
                        ...current,
                        isSeasonal: nextIsSeasonal,
                        recurringCutoffDate:
                          nextIsSeasonal && !String(current.recurringCutoffDate || "").trim()
                            ? getDefaultSeasonalCutoffDate()
                            : current.recurringCutoffDate,
                      };
                    })
                  }
                />
                <span className="label-text">Seasonal item</span>
              </label>

              {skuForm.isSeasonal && (
                <label className="form-control w-full md:col-span-2">
                  <div className="label items-center">
                    <span className="label-text">Subscription end date</span>
                    <span
                      className="ml-2 cursor-help rounded-full border border-base-300 px-2 py-0.5 text-xs opacity-70"
                      title="Seasonal products can be included in subscriptions only for deliveries before this date."
                    >
                      ?
                    </span>
                  </div>
                  <input
                    type="date"
                    className="input input-bordered"
                    value={skuForm.recurringCutoffDate || ""}
                    onChange={(event) =>
                      setSkuForm((current) => ({
                        ...current,
                        recurringCutoffDate: event.target.value,
                      }))
                    }
                  />
                  <div className="label">
                    <span className="label-text-alt">
                      Last date before which this seasonal product can be delivered in a subscription.
                    </span>
                  </div>
                </label>
              )}

              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Product name</span></div>
                <input
                  className="input input-bordered"
                  value={skuForm.name}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="form-control w-full">
                <div className="label"><span className="label-text">Price</span></div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input input-bordered"
                  value={skuForm.unitPrice}
                  onChange={(event) =>
                    setSkuForm((current) => ({
                      ...current,
                      unitPrice: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="form-control w-full">
                <div className="label"><span className="label-text">HSN code</span></div>
                <input
                  className="input input-bordered"
                  value={skuForm.hsnCode}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, hsnCode: event.target.value }))
                  }
                />
              </label>
              <label className="form-control w-full">
                <div className="label"><span className="label-text">GST rate (%)</span></div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input input-bordered"
                  value={skuForm.gstRate}
                  onChange={(event) =>
                    setSkuForm((current) => ({
                      ...current,
                      gstRate: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Description</span></div>
                <textarea
                  className="textarea textarea-bordered"
                  rows={3}
                  value={skuForm.notes}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="mt-4 card-actions justify-between">
              <button type="submit" className="btn btn-primary" disabled={isSaving || isDeleting}>
                {isSaving ? "Saving..." : "Save product"}
              </button>
              <div className="flex items-center gap-2">
                {skuForm.id && (
                  <button
                    type="button"
                    className="btn btn-outline btn-error"
                    onClick={onDelete}
                    disabled={isSaving || isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete product"}
                  </button>
                )}
                {skuForm.id && <div className="badge badge-outline">Product ID: {skuForm.id}</div>}
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
      )}
    </section>
  );
}
