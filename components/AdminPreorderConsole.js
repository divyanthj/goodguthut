"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sortPreorderWindows } from "@/libs/preorder-windows";

const toDateInputValue = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const toDateTimeInputValue = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const formatDate = (value) => {
  if (!value) {
    return "No date set";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: value.includes?.("T") || value.includes?.(":") ? "short" : undefined,
  });
};

const createEmptyDeliveryBand = () => ({ minDistanceKm: 0, maxDistanceKm: 0, fee: 0 });

const createSessionToken = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createStoredPickupSelection = (pickupAddress = "") =>
  pickupAddress
    ? { placeId: "", formattedAddress: pickupAddress }
    : null;

const cloneDeliveryBands = (bands = []) =>
  bands.map((band) => ({
    minDistanceKm: Number(band.minDistanceKm || 0),
    maxDistanceKm: Number(band.maxDistanceKm || 0),
    fee: Number(band.fee || 0),
  }));

const addMinuteToDateTimeInput = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setMinutes(date.getMinutes() + 1);
  return toDateTimeInputValue(date);
};

const normalizeAllowedItems = (allowedItems = []) => {
  const seenSkus = new Set();

  return allowedItems
    .map((item) => (typeof item === "string" ? item : item?.sku || ""))
    .map((sku) => sku.trim().toUpperCase())
    .filter(Boolean)
    .filter((sku) => {
      if (seenSkus.has(sku)) {
        return false;
      }

      seenSkus.add(sku);
      return true;
    })
    .map((sku) => ({ sku }));
};

const createWindowConfig = (windowData) => ({
  id: windowData.id || "",
  title: windowData.title || "",
  status: windowData.status || "draft",
  opensAt: toDateTimeInputValue(windowData.opensAt),
  closesAt: toDateTimeInputValue(windowData.closesAt),
  deliveryDate: toDateInputValue(windowData.deliveryDate),
  currency: windowData.currency || "INR",
  minimumOrderQuantity: Number(windowData.minimumOrderQuantity || 1),
  pickupAddress: windowData.pickupAddress || "",
  pickupDoorNumber: windowData.pickupDoorNumber || "",
  allowFreePickup: windowData.allowFreePickup === true,
  deliveryBands: windowData.deliveryBands?.length ? windowData.deliveryBands : [createEmptyDeliveryBand()],
  freeDeliveryThreshold:
    windowData.freeDeliveryThreshold === null ||
    windowData.freeDeliveryThreshold === undefined ||
    windowData.freeDeliveryThreshold === ""
      ? ""
      : Number(windowData.freeDeliveryThreshold || 0),
  driverPayoutPerKm: Number(windowData.driverPayoutPerKm || 0),
  allowedItems: normalizeAllowedItems(windowData.allowedItems),
  allowCustomerNotes: windowData.allowCustomerNotes !== false,
  openImmediately:
    windowData.status === "open"
      ? !windowData.opensAt || new Date(windowData.opensAt).getTime() <= Date.now()
      : false,
});

const buildNewBatchConfig = (defaultWindow, previousWindow) => {
  const baseWindow = createWindowConfig(defaultWindow);

  if (!previousWindow) {
    return baseWindow;
  }

  return {
    ...baseWindow,
    deliveryBands: previousWindow.deliveryBands?.length
      ? cloneDeliveryBands(previousWindow.deliveryBands)
      : baseWindow.deliveryBands,
    opensAt: addMinuteToDateTimeInput(previousWindow.closesAt),
  };
};

const createEmptySkuForm = () => ({
  id: "",
  sku: "",
  name: "",
  notes: "",
  unitPrice: 0,
  status: "active",
  isSeasonal: false,
});

const getWindowTimingState = (windowData, now = new Date()) => {
  if (windowData.status !== "open") {
    return windowData.status;
  }

  if (windowData.opensAt && new Date(windowData.opensAt) > now) {
    return "scheduled";
  }

  if (windowData.closesAt && new Date(windowData.closesAt) <= now) {
    return "closed";
  }

  return "live";
};

const getWindowStatusMeta = (windowData) => {
  const timingState = getWindowTimingState(windowData);

  if (timingState === "scheduled") {
    return { badge: "scheduled", detail: `Opens at ${formatDate(windowData.opensAt)}`, badgeClassName: "badge-warning" };
  }

  if (timingState === "live") {
    return { badge: "open", detail: "Live on landing page", badgeClassName: "badge-success" };
  }

  if (timingState === "draft") {
    return { badge: "draft", detail: "Not visible on landing page", badgeClassName: "badge-ghost" };
  }

  if (timingState === "archived") {
    return { badge: "archived", detail: "Kept for record only", badgeClassName: "badge-neutral" };
  }

  return {
    badge: "closed",
    detail: windowData.closesAt ? `Closed at ${formatDate(windowData.closesAt)}` : "Closed manually",
    badgeClassName: "badge-outline",
  };
};

const getWindowStatusLabel = (windowData) => {
  const timingState = getWindowTimingState(windowData);
  if (timingState === "scheduled") {
    return `opens at ${formatDate(windowData.opensAt)}`;
  }
  return timingState === "live" ? "open" : timingState;
};

const canScheduleAfterLiveWindow = (windowData, liveOpenWindow) => {
  if (!liveOpenWindow) {
    return true;
  }

  if (windowData.id && liveOpenWindow.id === windowData.id) {
    return true;
  }

  if (windowData.status !== "open") {
    return true;
  }

  if (windowData.openImmediately || !liveOpenWindow.closesAt || !windowData.opensAt) {
    return false;
  }

  return new Date(windowData.opensAt).getTime() > new Date(liveOpenWindow.closesAt).getTime();
};

const getLiveWindowConflictMessage = (liveOpenWindow) => {
  if (!liveOpenWindow) {
    return "";
  }

  if (liveOpenWindow.closesAt) {
    return `Another batch is live right now. Set this batch to open after ${formatDate(liveOpenWindow.closesAt)}.`;
  }

  return "Another batch is live right now. Close it or add a close time before scheduling this one.";
};

export default function AdminPreorderConsole({
  initialWindows,
  initialSkuCatalog,
  defaultWindow,
  adminEmail,
  view = "full",
}) {
  const isSettingsView = view === "settings";
  const isPreordersView = view === "preorders";
  const [windows, setWindows] = useState(sortPreorderWindows(initialWindows || []));
  const [skuCatalog, setSkuCatalog] = useState(initialSkuCatalog || []);
  const [selectedId, setSelectedId] = useState(initialWindows?.[0]?.id || "new");
  const [windowConfig, setWindowConfig] = useState(
    initialWindows?.[0] ? createWindowConfig(initialWindows[0]) : createWindowConfig(defaultWindow)
  );
  const [skuForm, setSkuForm] = useState(createEmptySkuForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [isSavingSku, setIsSavingSku] = useState(false);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [pickupLookupError, setPickupLookupError] = useState("");
  const [isLoadingPickupSuggestions, setIsLoadingPickupSuggestions] = useState(false);
  const [selectedPickupPlace, setSelectedPickupPlace] = useState(() =>
    createStoredPickupSelection(initialWindows?.[0]?.pickupAddress || defaultWindow.pickupAddress)
  );
  const [pickupSessionToken, setPickupSessionToken] = useState(() => createSessionToken());
  const batchEditorRef = useRef(null);
  const skuEditorRef = useRef(null);

  const skuCatalogMap = useMemo(
    () => new Map(skuCatalog.map((item) => [item.sku, item])),
    [skuCatalog]
  );
  const includedSkuCodes = useMemo(
    () => (windowConfig.allowedItems || []).map((item) => item.sku),
    [windowConfig.allowedItems]
  );
  const includedSkus = useMemo(
    () => includedSkuCodes.map((sku) => skuCatalogMap.get(sku)).filter(Boolean),
    [includedSkuCodes, skuCatalogMap]
  );
  const availableSkus = useMemo(
    () => skuCatalog.filter((item) => !includedSkuCodes.includes(item.sku)),
    [skuCatalog, includedSkuCodes]
  );
  const storefrontStatusLabel = useMemo(
    () => getWindowStatusLabel(windowConfig),
    [windowConfig]
  );
  const liveOpenWindow = useMemo(
    () =>
      windows.find(
        (item) => item.id !== windowConfig.id && getWindowTimingState(item) === "live"
      ) || null,
    [windows, windowConfig.id]
  );
  const canSaveOpenWindow = useMemo(
    () => canScheduleAfterLiveWindow(windowConfig, liveOpenWindow),
    [windowConfig, liveOpenWindow]
  );
  const liveWindowConflictMessage = useMemo(
    () => getLiveWindowConflictMessage(liveOpenWindow),
    [liveOpenWindow]
  );
  const previousBatchTemplate = useMemo(
    () => liveOpenWindow || windows[0] || null,
    [liveOpenWindow, windows]
  );

  const clearFeedback = () => {
    setMessage("");
    setError("");
  };

  const selectWindow = (nextWindow) => {
    clearFeedback();
    setPickupLookupError("");
    setPickupSuggestions([]);
    setPickupSessionToken(createSessionToken());
    setSelectedId(nextWindow.id || "new");
    setWindowConfig(createWindowConfig(nextWindow));
    setSelectedPickupPlace(createStoredPickupSelection(nextWindow.pickupAddress));
    window.requestAnimationFrame(() => {
      batchEditorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const selectSkuForm = (nextSkuForm) => {
    setSkuForm(nextSkuForm);
    window.requestAnimationFrame(() => {
      skuEditorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const startNewBatch = () => {
    selectWindow(buildNewBatchConfig(defaultWindow, previousBatchTemplate));
  };

  const refreshData = async (preferredWindowId = selectedId, preferredSkuId = skuForm.id) => {
    const response = await fetch("/api/admin/preorder-window");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load admin data.");
    }

    const nextWindows = sortPreorderWindows(data.preorderWindows || []);
    const nextSkuCatalog = data.skuCatalog || [];

    setWindows(nextWindows);
    setSkuCatalog(nextSkuCatalog);

    if (preferredSkuId) {
      const nextSku = nextSkuCatalog.find((item) => item.id === preferredSkuId);
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
      }
    }

    if (nextWindows.length === 0) {
      selectWindow(buildNewBatchConfig(defaultWindow, null));
      return;
    }

    const preferredWindow = nextWindows.find((item) => item.id === preferredWindowId);
    selectWindow(preferredWindow || nextWindows[0]);
  };

  useEffect(() => {
    const input = (windowConfig.pickupAddress || "").trim();

    if (!input || input.length < 3) {
      setPickupSuggestions([]);
      setIsLoadingPickupSuggestions(false);
      return undefined;
    }

    if (selectedPickupPlace && selectedPickupPlace.formattedAddress === windowConfig.pickupAddress) {
      setPickupSuggestions([]);
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoadingPickupSuggestions(true);

      try {
        const response = await fetch("/api/preorder/address-autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, sessionToken: pickupSessionToken }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not load pickup address suggestions.");
        }

        setPickupSuggestions(data.suggestions || []);
      } catch (lookupError) {
        setPickupSuggestions([]);
        setPickupLookupError(lookupError.message || "Could not load pickup address suggestions.");
      } finally {
        setIsLoadingPickupSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [windowConfig.pickupAddress, pickupSessionToken, selectedPickupPlace]);

  const setField = (field, value) => {
    setWindowConfig((current) => {
      if (field === "status" && value !== "open") {
        return { ...current, status: value, openImmediately: false };
      }

      return { ...current, [field]: value };
    });
  };

  const updateDeliveryBand = (index, field, value) => {
    setWindowConfig((current) => ({
      ...current,
      deliveryBands: current.deliveryBands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [field]: value } : band
      ),
    }));
  };

  const includeSku = (sku) => {
    setWindowConfig((current) => ({
      ...current,
      allowedItems: [...current.allowedItems, { sku }],
    }));
  };

  const removeIncludedSku = (sku) => {
    setWindowConfig((current) => ({
      ...current,
      allowedItems: current.allowedItems.filter((item) => item.sku !== sku),
    }));
  };

  const handlePickupInputChange = (value) => {
    setField("pickupAddress", value);
    if (selectedPickupPlace) {
      setPickupSessionToken(createSessionToken());
    }
    setSelectedPickupPlace(null);
    setPickupLookupError("");
  };

  const handlePickupSuggestionSelect = async (suggestion) => {
    setIsLoadingPickupSuggestions(true);
    setPickupLookupError("");

    try {
      const response = await fetch("/api/preorder/address-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken: pickupSessionToken }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not verify that pickup address.");
      }

      setSelectedPickupPlace(data.place);
      setField("pickupAddress", data.place.formattedAddress);
      setPickupSuggestions([]);
    } catch (selectionError) {
      setPickupLookupError(selectionError.message || "Could not verify that pickup address.");
    } finally {
      setIsLoadingPickupSuggestions(false);
    }
  };

  const onSaveSku = async (event) => {
    event.preventDefault();
    clearFeedback();
    setIsSavingSku(true);

    try {
      const isEditing = Boolean(skuForm.id);
      const response = await fetch(isEditing ? `/api/admin/skus/${skuForm.id}` : "/api/admin/skus", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...skuForm,
          isSeasonal: skuForm.isSeasonal === true,
          skuType: skuForm.isSeasonal === true ? "seasonal" : "perennial",
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save SKU.");
      }

      await refreshData(selectedId, data.sku.id);
      setMessage(isEditing ? "SKU updated." : "SKU created.");
    } catch (saveError) {
      setError(saveError.message || "Could not save SKU.");
    } finally {
      setIsSavingSku(false);
    }
  };

  const onSaveBatch = async (event) => {
    event.preventDefault();
    clearFeedback();
    setPickupLookupError("");

    if (windowConfig.pickupAddress?.trim() && !selectedPickupPlace) {
      setError("Please select the pickup address from the suggestions before saving.");
      return;
    }

    if (!canSaveOpenWindow) {
      setError(liveWindowConflictMessage);
      return;
    }

    setIsSavingBatch(true);

    try {
      const isEditing = Boolean(windowConfig.id);
      const response = await fetch(
        isEditing ? `/api/admin/preorder-window/${windowConfig.id}` : "/api/admin/preorder-window",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(windowConfig),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save preorder batch.");
      }

      await refreshData(data.preorderWindow.id);
      setMessage(isEditing ? "Preorder batch updated." : "Preorder batch created.");
    } catch (saveError) {
      setError(saveError.message || "Could not save preorder batch.");
    } finally {
      setIsSavingBatch(false);
    }
  };

  const updateStatus = async (status) => {
    if (!windowConfig.id) {
      setField("status", status);
      return;
    }

    clearFeedback();
    setIsSavingBatch(true);

    try {
      const response = await fetch(`/api/admin/preorder-window/${windowConfig.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update preorder batch status.");
      }

      await refreshData(data.preorderWindow.id);
      setMessage(status === "open" ? "Batch opened." : `Batch marked ${status}.`);
    } catch (statusError) {
      setError(statusError.message || "Could not update preorder batch status.");
    } finally {
      setIsSavingBatch(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-base-300 bg-base-200 p-4 text-sm">
        Signed in as <strong>{adminEmail}</strong>. Only emails listed in <code>ADMINS</code> can use this page.
      </div>

      <div className={`grid gap-6 ${isPreordersView ? "lg:grid-cols-[320px_minmax(0,1fr)]" : ""}`}>
        {isPreordersView && (
        <aside className="space-y-4">
          <div className="rounded-2xl bg-base-100 p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Preorder batches</h2>
                <p className="text-sm opacity-70">Batches pick from the shared SKU catalog.</p>
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={startNewBatch}>
                New batch
              </button>
            </div>
          </div>

          {windows.map((windowItem) => {
            const isSelected = windowItem.id === selectedId;
            const statusMeta = getWindowStatusMeta(windowItem);
            const includedCount = normalizeAllowedItems(windowItem.allowedItems).length;

            return (
              <button
                key={windowItem.id}
                type="button"
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                  isSelected ? "border-primary bg-primary/10" : "border-base-300 bg-base-100 hover:border-primary/40"
                }`}
                onClick={() => selectWindow(windowItem)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-2xl font-semibold leading-tight text-slate-900">{windowItem.title}</div>
                    <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      {statusMeta.detail}
                    </div>
                    <div className="mt-1 text-xs opacity-70">Delivery: {formatDate(windowItem.deliveryDate)}</div>
                  </div>
                  <div className={`badge shrink-0 ${statusMeta.badgeClassName}`}>{statusMeta.badge}</div>
                </div>
                <div className="mt-3 text-xs opacity-70">{includedCount} included SKU(s)</div>
                <div className="mt-1 text-xs opacity-70">
                  Close: {windowItem.closesAt ? formatDate(windowItem.closesAt) : "Manual close"}
                </div>
              </button>
            );
          })}
        </aside>
        )}

        <div className="space-y-6">
          {!isPreordersView && (
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body gap-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">SKU catalog</h2>
                  <p className="text-sm opacity-70">Global product data lives here.</p>
                </div>
                <button type="button" className="btn btn-outline" onClick={() => selectSkuForm(createEmptySkuForm())}>
                  New SKU
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {skuCatalog.map((skuItem) => (
                  <button
                    key={skuItem.id}
                    type="button"
                    className={`rounded-2xl border p-4 text-left ${
                      skuForm.id === skuItem.id ? "border-primary bg-primary/10" : "border-base-300 bg-base-100"
                    }`}
                    onClick={() =>
                      selectSkuForm({
                        id: skuItem.id,
                        sku: skuItem.sku,
                        name: skuItem.name,
                        notes: skuItem.notes || "",
                        unitPrice: Number(skuItem.unitPrice || 0),
                        status: skuItem.status || "active",
                        isSeasonal:
                          skuItem.isSeasonal === true || skuItem.skuType === "seasonal",
                      })
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{skuItem.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] opacity-60">{skuItem.sku}</div>
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
                ))}
              </div>

              <form ref={skuEditorRef} onSubmit={onSaveSku} className="rounded-2xl border border-base-300 bg-base-200 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="form-control w-full">
                    <div className="label"><span className="label-text">SKU code</span></div>
                    <input
                      className="input input-bordered"
                      disabled={Boolean(skuForm.id)}
                      value={skuForm.sku}
                      onChange={(event) => setSkuForm((current) => ({ ...current, sku: event.target.value.toUpperCase() }))}
                    />
                  </label>
                  <label className="form-control w-full">
                    <div className="label"><span className="label-text">Status</span></div>
                    <select
                      className="select select-bordered"
                      value={skuForm.status}
                      onChange={(event) => setSkuForm((current) => ({ ...current, status: event.target.value }))}
                    >
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  <label className="label mt-6 cursor-pointer justify-start gap-3">
                    <input
                      type="checkbox"
                      className="toggle toggle-sm"
                      checked={skuForm.isSeasonal === true}
                      onChange={(event) =>
                        setSkuForm((current) => ({
                          ...current,
                          isSeasonal: event.target.checked,
                        }))
                      }
                    />
                    <span className="label-text">Seasonal SKU</span>
                  </label>
                  <label className="form-control w-full md:col-span-2">
                    <div className="label"><span className="label-text">Product name</span></div>
                    <input
                      className="input input-bordered"
                      value={skuForm.name}
                      onChange={(event) => setSkuForm((current) => ({ ...current, name: event.target.value }))}
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
                      onChange={(event) => setSkuForm((current) => ({ ...current, unitPrice: Number(event.target.value || 0) }))}
                    />
                  </label>
                  <label className="form-control w-full md:col-span-2">
                    <div className="label"><span className="label-text">Description</span></div>
                    <textarea
                      className="textarea textarea-bordered"
                      rows={3}
                      value={skuForm.notes}
                      onChange={(event) => setSkuForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-4 card-actions justify-between">
                  <button type="submit" className="btn btn-primary" disabled={isSavingSku}>
                    {isSavingSku ? "Saving..." : "Save SKU"}
                  </button>
                  {skuForm.id && <div className="badge badge-outline">SKU ID: {skuForm.id}</div>}
                </div>
              </form>
            </div>
          </div>
          )}

          <form ref={batchEditorRef} onSubmit={onSaveBatch} className="card bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {isSettingsView
                      ? "Delivery settings"
                      : windowConfig.id
                        ? "Edit preorder batch"
                        : "Create preorder batch"}
                  </h2>
                  <p className="mt-1 text-sm opacity-70">
                    {isSettingsView
                      ? "Choose a batch and update its delivery pricing and pickup settings."
                      : "This batch only controls timing, delivery rules, and which catalog SKUs are included."}
                  </p>
                  {!canSaveOpenWindow && (
                    <p className="mt-2 text-sm text-warning">{liveWindowConflictMessage}</p>
                  )}
                </div>
                {!isSettingsView && (
                <div className="flex flex-wrap items-center gap-2">
                  {windowConfig.id && windowConfig.status !== "open" && (
                    <button type="button" className="btn btn-outline" disabled={isSavingBatch || Boolean(liveOpenWindow)} onClick={() => updateStatus("open")}>
                      Open batch
                    </button>
                  )}
                  {windowConfig.id && windowConfig.status === "open" && (
                    <button type="button" className="btn btn-outline" disabled={isSavingBatch} onClick={() => updateStatus("closed")}>
                      Close batch
                    </button>
                  )}
                </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {isSettingsView && (
                  <label className="form-control w-full md:col-span-2">
                    <div className="label"><span className="label-text">Choose batch</span></div>
                    <select
                      className="select select-bordered"
                      value={windowConfig.id || "new"}
                      onChange={(event) => {
                        const nextWindow = windows.find((item) => item.id === event.target.value);
                        if (nextWindow) {
                          selectWindow(nextWindow);
                          return;
                        }

                        selectWindow(buildNewBatchConfig(defaultWindow, previousBatchTemplate));
                      }}
                    >
                      {windows.map((windowItem) => (
                        <option key={windowItem.id} value={windowItem.id}>
                          {windowItem.title} ({getWindowStatusLabel(windowItem)})
                        </option>
                      ))}
                      {windows.length === 0 && <option value="new">New batch draft</option>}
                    </select>
                  </label>
                )}
                {!isSettingsView && (
                <label className="form-control w-full md:col-span-2">
                  <div className="label"><span className="label-text">Batch title</span></div>
                  <input className="input input-bordered" value={windowConfig.title} onChange={(event) => setField("title", event.target.value)} />
                </label>
                )}
                {!isSettingsView && (
                <label className="form-control w-full">
                  <div className="label"><span className="label-text">Status</span></div>
                  <select className="select select-bordered" value={windowConfig.status} onChange={(event) => setField("status", event.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="archived">Archived</option>
                  </select>
                  {!canSaveOpenWindow && (
                    <div className="mt-2 text-sm text-warning">{liveWindowConflictMessage}</div>
                  )}
                </label>
                )}
                {!isSettingsView && (
                <label className="form-control w-full">
                  <div className="label"><span className="label-text">Delivery date</span></div>
                  <input type="date" className="input input-bordered" value={windowConfig.deliveryDate} onChange={(event) => setField("deliveryDate", event.target.value)} />
                </label>
                )}
                {!isSettingsView && (
                <label className="form-control w-full">
                  <div className="label"><span className="label-text">Opens at (optional)</span></div>
                  <input
                    type="datetime-local"
                    className="input input-bordered"
                    value={windowConfig.opensAt}
                    disabled={windowConfig.status === "open" && windowConfig.openImmediately}
                    onChange={(event) => setField("opensAt", event.target.value)}
                  />
                  {windowConfig.status === "open" && (
                    <label className="label cursor-pointer justify-start gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={windowConfig.openImmediately}
                        onChange={(event) =>
                          setWindowConfig((current) => ({
                            ...current,
                            openImmediately: event.target.checked,
                            opensAt: event.target.checked ? "" : current.opensAt,
                          }))
                        }
                      />
                      <span className="label-text">Open immediately</span>
                    </label>
                  )}
                </label>
                )}
                {!isSettingsView && (
                <label className="form-control w-full">
                  <div className="label"><span className="label-text">Close date/time (optional)</span></div>
                  <input type="datetime-local" className="input input-bordered" value={windowConfig.closesAt} onChange={(event) => setField("closesAt", event.target.value)} />
                </label>
                )}
                <label className="form-control w-full">
                  <div className="label"><span className="label-text">Minimum order quantity</span></div>
                  <input type="number" min="1" className="input input-bordered" value={windowConfig.minimumOrderQuantity} onChange={(event) => setField("minimumOrderQuantity", Number(event.target.value || 1))} />
                </label>
                <label className="form-control w-full">
                  <div className="label"><span className="label-text">Currency</span></div>
                  <input className="input input-bordered" value={windowConfig.currency} onChange={(event) => setField("currency", event.target.value.toUpperCase())} />
                </label>
                <div className="form-control w-full md:col-span-2">
                  <div className="label"><span className="label-text">Pickup address</span></div>
                  <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    <input
                      className="input input-bordered w-full"
                      value={windowConfig.pickupDoorNumber || ""}
                      onChange={(event) => setField("pickupDoorNumber", event.target.value)}
                      placeholder="Door / unit number"
                    />
                    <input
                      className="input input-bordered w-full"
                      value={windowConfig.pickupAddress || ""}
                      onChange={(event) => handlePickupInputChange(event.target.value)}
                      autoComplete="off"
                      placeholder="Pickup street address"
                    />
                  </div>
                  <label className="label cursor-pointer justify-start gap-3">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={windowConfig.allowFreePickup === true}
                      onChange={(event) => setField("allowFreePickup", event.target.checked)}
                    />
                    <span className="label-text">Enable free pickups for this batch</span>
                  </label>
                  {pickupSuggestions.length > 0 && (
                    <div className="mt-2 rounded-2xl border border-base-300 bg-base-100 shadow-lg">
                      <ul className="max-h-72 overflow-y-auto py-2">
                        {pickupSuggestions.map((suggestion) => (
                          <li key={suggestion.placeId}>
                            <button type="button" className="w-full px-4 py-3 text-left hover:bg-base-200" onClick={() => handlePickupSuggestionSelect(suggestion)}>
                              <div className="font-medium">{suggestion.primaryText}</div>
                              {suggestion.secondaryText && <div className="text-sm opacity-70">{suggestion.secondaryText}</div>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {isLoadingPickupSuggestions && (windowConfig.pickupAddress || "").trim().length >= 3 && (
                    <div className="mt-2 text-xs opacity-70">Looking up pickup addresses...</div>
                  )}
                  {selectedPickupPlace?.formattedAddress && (
                    <div className="mt-3 rounded-2xl border border-base-300 bg-base-200 p-4 text-sm">
                      <div className="font-medium">Verified pickup address</div>
                      <div className="mt-1 opacity-80">
                        {[windowConfig.pickupDoorNumber, selectedPickupPlace.formattedAddress]
                          .map((part) => String(part || "").trim())
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    </div>
                  )}
                  {pickupLookupError && <div className="mt-2 text-sm text-error">{pickupLookupError}</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-base-300 bg-base-200 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">Delivery charges</h3>
                    <p className="text-sm opacity-70">Set distance-based delivery charges, or offer free delivery above a preorder amount.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() =>
                      setWindowConfig((current) => ({
                        ...current,
                        deliveryBands: [...current.deliveryBands, createEmptyDeliveryBand()],
                      }))
                    }
                  >
                    Add distance slab
                  </button>
                </div>
                <label className="form-control w-full">
                  <div className="label">
                    <span className="label-text">Free delivery above (optional)</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input input-bordered"
                    value={windowConfig.freeDeliveryThreshold}
                    onChange={(event) => setField("freeDeliveryThreshold", event.target.value)}
                    placeholder="Leave blank to use only distance-based charges"
                  />
                  <div className="mt-2 text-sm opacity-70">
                    If you set an amount here, customers whose preorder subtotal reaches it before discounts will get free delivery.
                  </div>
                </label>
                <label className="form-control w-full">
                  <div className="label">
                    <span className="label-text">Driver payout per km</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input input-bordered"
                    value={windowConfig.driverPayoutPerKm}
                    onChange={(event) =>
                      setField("driverPayoutPerKm", Number(event.target.value || 0))
                    }
                    placeholder="0"
                  />
                  <div className="mt-2 text-sm opacity-70">
                    Used by the delivery route planner to estimate what you should pay your own driver for this batch.
                  </div>
                </label>
                <div className="space-y-3">
                  {windowConfig.deliveryBands.map((band, index) => (
                    <div key={`delivery-band-${index}`} className="grid gap-3 rounded-xl bg-base-100 p-4 md:grid-cols-4">
                      <input type="number" min="0" step="0.1" className="input input-bordered" value={band.minDistanceKm} onChange={(event) => updateDeliveryBand(index, "minDistanceKm", Number(event.target.value || 0))} />
                      <input type="number" min="0" step="0.1" className="input input-bordered" value={band.maxDistanceKm} onChange={(event) => updateDeliveryBand(index, "maxDistanceKm", Number(event.target.value || 0))} />
                      <input type="number" min="0" step="0.01" className="input input-bordered" value={band.fee} onChange={(event) => updateDeliveryBand(index, "fee", Number(event.target.value || 0))} />
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost text-error"
                        onClick={() =>
                          setWindowConfig((current) => ({
                            ...current,
                            deliveryBands: current.deliveryBands.filter((_, bandIndex) => bandIndex !== index),
                          }))
                        }
                      >
                        Remove slab
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {!isSettingsView && (
              <div className="rounded-2xl border border-base-300 bg-base-200 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">Included SKUs</h3>
                    <p className="text-sm opacity-70">Choose products from the shared catalog for this batch.</p>
                  </div>
                  <div className="badge badge-outline">{includedSkuCodes.length} included SKU(s)</div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {includedSkus.map((skuItem) => (
                    <div key={`included-${skuItem.sku}`} className="rounded-xl bg-base-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{skuItem.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] opacity-60">{skuItem.sku}</div>
                        </div>
                        <button type="button" className="btn btn-sm btn-ghost text-error" onClick={() => removeIncludedSku(skuItem.sku)}>
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 text-sm opacity-75">{skuItem.notes || "No description yet."}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="mb-3 text-sm font-medium opacity-75">Add from catalog</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {availableSkus.map((skuItem) => (
                      <div key={`available-${skuItem.sku}`} className="rounded-xl bg-base-100 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{skuItem.name}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.18em] opacity-60">{skuItem.sku}</div>
                          </div>
                          <button type="button" className="btn btn-sm btn-primary" disabled={skuItem.status !== "active"} onClick={() => includeSku(skuItem.sku)}>
                            {skuItem.status === "active" ? "Add" : "Archived"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}

              <div className="card-actions items-center justify-between">
                <button type="submit" className="btn btn-primary" disabled={isSavingBatch}>
                  {isSavingBatch ? "Saving..." : isSettingsView ? "Save delivery settings" : "Save batch"}
                </button>
                {!isSettingsView && (
                  <div className="badge badge-outline">Storefront status: {storefrontStatusLabel}</div>
                )}
              </div>
            </div>
          </form>

          {message && <div className="alert alert-success"><span>{message}</span></div>}
          {error && <div className="alert alert-error"><span>{error}</span></div>}
        </div>
      </div>
    </div>
  );
}
