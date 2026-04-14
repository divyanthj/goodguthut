"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const createEmptySkuForm = () => ({
  id: "",
  sku: "",
  name: "",
  notes: "",
  unitPrice: 0,
  status: "active",
  isSeasonal: false,
});

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

  const refreshData = useCallback(async (preferredSkuId = "") => {
    setIsLoading(true);
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
            status: nextSku.status || "active",
            isSeasonal:
              nextSku.isSeasonal === true || nextSku.skuType === "seasonal",
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
        status: first.status || "active",
        isSeasonal: first.isSeasonal === true || first.skuType === "seasonal",
      });
    } catch (loadError) {
      setError(loadError.message || "Could not load products.");
    } finally {
      setIsLoading(false);
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
      status: skuItem.status || "active",
      isSeasonal: skuItem.isSeasonal === true || skuItem.skuType === "seasonal",
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
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save product.");
      }

      await refreshData(data.sku?.id || skuForm.id);
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

      await refreshData("");
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
                  <div className="mt-2 text-sm opacity-75">{skuItem.notes || "No description yet."}</div>
                  <div className="mt-3 text-sm font-medium">INR {Number(skuItem.unitPrice || 0).toFixed(2)}</div>
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
                    setSkuForm((current) => ({ ...current, isSeasonal: event.target.checked }))
                  }
                />
                <span className="label-text">Seasonal item</span>
              </label>

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
