"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const createEmptySkuForm = () => ({
  id: "",
  sku: "",
  name: "",
  notes: "",
  category: "other",
  imageUrl: "",
  shortDescription: "",
  benefits: "",
  leadTimeDays: 0,
  displayOrder: 0,
  packLabel: "",
  unitPrice: 0,
  hsnCode: "",
  gstRate: 0,
  status: "active",
  isSeasonal: false,
  recurringCutoffDate: "",
});

const CATEGORY_OPTIONS = [
  { value: "kanji", label: "Kanji" },
  { value: "sparkle", label: "Sparkle" },
  { value: "pickles", label: "Pickles" },
  { value: "gift_packs", label: "Gift Packs" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "custom_orders", label: "Custom Orders" },
  { value: "other", label: "Other" },
];

const hydrateSkuForm = (skuItem = {}) => ({
  id: skuItem.id || "",
  sku: skuItem.sku || "",
  name: skuItem.name || "",
  notes: skuItem.notes || "",
  category: skuItem.category || "other",
  imageUrl: skuItem.imageUrl || "",
  shortDescription: skuItem.shortDescription || "",
  benefits: skuItem.benefits || "",
  leadTimeDays: Number(skuItem.leadTimeDays || 0),
  displayOrder: Number(skuItem.displayOrder || 0),
  packLabel: skuItem.packLabel || "",
  unitPrice: Number(skuItem.unitPrice || 0),
  hsnCode: skuItem.hsnCode || "",
  gstRate: Number(skuItem.gstRate || 0),
  status: skuItem.status || "active",
  isSeasonal: skuItem.isSeasonal === true || skuItem.skuType === "seasonal",
  recurringCutoffDate: String(skuItem.recurringCutoffDate || "").trim(),
});

const getDefaultSeasonalCutoffDate = (now = new Date()) => {
  const next = new Date(now);
  next.setMonth(next.getMonth() + 3);
  return next.toISOString().slice(0, 10);
};

export default function AdminSkuCatalogManager({ embedded = false }) {
  const [skuCatalog, setSkuCatalog] = useState([]);
  const [skuForm, setSkuForm] = useState(createEmptySkuForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
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
          setSkuForm(hydrateSkuForm(nextSku));
          return;
        }
      }

      const first = nextCatalog[0];
      setSkuForm(hydrateSkuForm(first));
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
    setSkuForm(hydrateSkuForm(skuItem));

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

  const onUploadImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError("");
    setMessage("");
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sku", skuForm.sku || skuForm.name || "product");

      const response = await fetch("/api/admin/skus/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not upload image.");
      }

      setSkuForm((current) => ({ ...current, imageUrl: data.url || "" }));
      setMessage("Image uploaded. Save the product to keep this image.");
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const content = (
    <>
      {!embedded && (
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
      )}

      {embedded && (
        <div className="flex justify-end">
          <button type="button" className="btn btn-outline" onClick={startNewSku}>
            New product
          </button>
        </div>
      )}

      {isLoading ? (
        <div className={`${embedded ? "mt-3" : "mt-4"} rounded-2xl bg-base-200 p-4 text-sm opacity-70`}>Loading products...</div>
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
                    {skuItem.categoryLabel || "Other"} ·{" "}
                    {skuItem.isSeasonal === true || skuItem.skuType === "seasonal"
                      ? "seasonal"
                      : "perennial"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {skuItem.packLabel && (
                      <div className="badge badge-outline">{skuItem.packLabel}</div>
                    )}
                    {Number(skuItem.leadTimeDays || 0) > 0 && (
                      <div className="badge badge-outline">
                        {Number(skuItem.leadTimeDays || 0)} day lead
                      </div>
                    )}
                    {Number(skuItem.displayOrder || 0) !== 0 && (
                      <div className="badge badge-outline">
                        Order {Number(skuItem.displayOrder || 0)}
                      </div>
                    )}
                  </div>
                  {(skuItem.isSeasonal === true || skuItem.skuType === "seasonal") &&
                    skuItem.recurringCutoffDate && (
                      <div className="mt-1 text-xs opacity-70">
                        Subscription end date: {skuItem.recurringCutoffDate}
                      </div>
                    )}
                  <div className="mt-2 text-sm opacity-75">
                    {skuItem.shortDescription || skuItem.notes || "No description yet."}
                  </div>
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
                <div className="label"><span className="label-text">Public category</span></div>
                <select
                  className="select select-bordered"
                  value={skuForm.category}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control w-full">
                <div className="label"><span className="label-text">Display order</span></div>
                <input
                  type="number"
                  step="1"
                  className="input input-bordered"
                  value={skuForm.displayOrder}
                  onChange={(event) =>
                    setSkuForm((current) => ({
                      ...current,
                      displayOrder: Number(event.target.value || 0),
                    }))
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
              <label className="form-control w-full">
                <div className="label"><span className="label-text">Product lead time override (days)</span></div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input input-bordered"
                  value={skuForm.leadTimeDays}
                  onChange={(event) =>
                    setSkuForm((current) => ({
                      ...current,
                      leadTimeDays: Number(event.target.value || 0),
                    }))
                  }
                />
                <div className="label">
                  <span className="label-text-alt">
                    Leave as 0 to use the category default from schedule settings.
                  </span>
                </div>
              </label>
              <label className="form-control w-full">
                <div className="label"><span className="label-text">Pack label</span></div>
                <input
                  className="input input-bordered"
                  value={skuForm.packLabel}
                  placeholder="Starter pack, party pack, gift box"
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, packLabel: event.target.value }))
                  }
                />
              </label>
              <div className="md:col-span-2">
                <div className="label">
                  <span className="label-text">Product image</span>
                </div>
                <div className="grid gap-4 rounded-2xl border border-base-300 bg-base-100 p-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div
                    aria-label={skuForm.imageUrl ? "Current product image preview" : "No product image preview"}
                    className="aspect-square rounded-xl border border-base-300 bg-base-200 bg-cover bg-center"
                    style={{
                      backgroundImage: skuForm.imageUrl
                        ? `url("${skuForm.imageUrl}")`
                        : "url(\"/images/logo.jpg\")",
                    }}
                  />
                  <div className="space-y-3">
                    <input
                      type="file"
                      className="file-input file-input-bordered w-full"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={isUploadingImage || isSaving || isDeleting}
                      onChange={onUploadImage}
                    />
                    <p className="text-xs opacity-70">
                      Upload JPG, PNG, WebP, or GIF images up to 5 MB. Save the product after upload.
                    </p>
                    <label className="form-control">
                      <div className="label">
                        <span className="label-text">Image URL</span>
                      </div>
                      <input
                        className="input input-bordered"
                        value={skuForm.imageUrl}
                        placeholder="Upload an image or paste an image URL"
                        onChange={(event) =>
                          setSkuForm((current) => ({ ...current, imageUrl: event.target.value }))
                        }
                      />
                    </label>
                    {isUploadingImage && (
                      <div className="text-sm font-medium opacity-70">Uploading image...</div>
                    )}
                  </div>
                </div>
              </div>
              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Short public description</span></div>
                <textarea
                  className="textarea textarea-bordered"
                  rows={2}
                  value={skuForm.shortDescription}
                  maxLength={240}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, shortDescription: event.target.value }))
                  }
                />
                <div className="label">
                  <span className="label-text-alt">
                    Used on the website product showcase. Keep it skimmable.
                  </span>
                </div>
              </label>
              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">What it does / benefits</span></div>
                <textarea
                  className="textarea textarea-bordered"
                  rows={3}
                  value={skuForm.benefits}
                  maxLength={500}
                  onChange={(event) =>
                    setSkuForm((current) => ({ ...current, benefits: event.target.value }))
                  }
                />
              </label>
              <label className="form-control w-full md:col-span-2">
                <div className="label"><span className="label-text">Internal / checkout description</span></div>
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
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
      {content}
    </section>
  );
}
