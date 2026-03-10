"use client";

import { useEffect, useMemo, useState } from "react";

const toDateInputValue = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
};

const createEmptySku = () => ({
  sku: "",
  productName: "",
  unitPrice: 0,
  isActive: true,
  maxPerOrder: 10,
  notes: "",
});

const createEmptyDeliveryBand = () => ({
  minDistanceKm: 0,
  maxDistanceKm: 0,
  fee: 0,
});

const createSessionToken = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createStoredPickupSelection = (pickupAddress = "") => {
  if (!pickupAddress) {
    return null;
  }

  return {
    placeId: "",
    formattedAddress: pickupAddress,
  };
};

export default function AdminPreorderConsole({ initialWindow, adminEmail }) {
  const [windowConfig, setWindowConfig] = useState({
    ...initialWindow,
    isOpen: initialWindow.status === "open",
    deliveryDate: toDateInputValue(initialWindow.deliveryDate),
    allowedItems: initialWindow.allowedItems?.length
      ? initialWindow.allowedItems
      : [createEmptySku()],
    deliveryBands: initialWindow.deliveryBands?.length
      ? initialWindow.deliveryBands
      : [createEmptyDeliveryBand()],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [pickupLookupError, setPickupLookupError] = useState("");
  const [isLoadingPickupSuggestions, setIsLoadingPickupSuggestions] = useState(false);
  const [selectedPickupPlace, setSelectedPickupPlace] = useState(() =>
    createStoredPickupSelection(initialWindow.pickupAddress)
  );
  const [pickupSessionToken, setPickupSessionToken] = useState(() => createSessionToken());

  const activeItemCount = useMemo(
    () => windowConfig.allowedItems.filter((item) => item.isActive).length,
    [windowConfig.allowedItems]
  );

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
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input,
            sessionToken: pickupSessionToken,
          }),
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
    setWindowConfig((current) => ({ ...current, [field]: value }));
  };

  const updateItem = (index, field, value) => {
    setWindowConfig((current) => ({
      ...current,
      allowedItems: current.allowedItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addItem = () => {
    setWindowConfig((current) => ({
      ...current,
      allowedItems: [...current.allowedItems, createEmptySku()],
    }));
  };

  const removeItem = (index) => {
    setWindowConfig((current) => ({
      ...current,
      allowedItems: current.allowedItems.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateDeliveryBand = (index, field, value) => {
    setWindowConfig((current) => ({
      ...current,
      deliveryBands: current.deliveryBands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [field]: value } : band
      ),
    }));
  };

  const addDeliveryBand = () => {
    setWindowConfig((current) => ({
      ...current,
      deliveryBands: [...current.deliveryBands, createEmptyDeliveryBand()],
    }));
  };

  const removeDeliveryBand = (index) => {
    setWindowConfig((current) => ({
      ...current,
      deliveryBands: current.deliveryBands.filter((_, bandIndex) => bandIndex !== index),
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: suggestion.placeId,
          sessionToken: pickupSessionToken,
        }),
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

  const onSave = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setPickupLookupError("");

    if (windowConfig.pickupAddress?.trim() && !selectedPickupPlace) {
      setError("Please select the pickup address from the suggestions before saving.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/preorder-window", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(windowConfig),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save preorder settings.");
      }

      setWindowConfig({
        ...data.preorderWindow,
        isOpen: data.preorderWindow.status === "open",
        deliveryDate: toDateInputValue(data.preorderWindow.deliveryDate),
        allowedItems: data.preorderWindow.allowedItems?.length
          ? data.preorderWindow.allowedItems
          : [createEmptySku()],
        deliveryBands: data.preorderWindow.deliveryBands?.length
          ? data.preorderWindow.deliveryBands
          : [createEmptyDeliveryBand()],
      });
      setSelectedPickupPlace(createStoredPickupSelection(data.preorderWindow.pickupAddress));
      setPickupSuggestions([]);
      setMessage("Admin settings saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save preorder settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-base-300 bg-base-200 p-4 text-sm">
        Signed in as <strong>{adminEmail}</strong>. Only emails listed in <code>ADMINS</code> can use this page.
      </div>

      <form onSubmit={onSave} className="card bg-base-100 shadow-xl">
        <div className="card-body gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="label cursor-pointer justify-start gap-3 rounded-xl border border-base-300 bg-base-200 px-4 py-4 md:col-span-2">
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={Boolean(windowConfig.isOpen)}
                onChange={(event) => setField("isOpen", event.target.checked)}
              />
              <div>
                <div className="font-medium">Accepting preorders</div>
                <div className="text-sm opacity-70">
                  Turn this on when customers should be able to place orders.
                </div>
              </div>
            </label>

            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Delivery date</span>
              </div>
              <input
                type="date"
                className="input input-bordered"
                value={windowConfig.deliveryDate}
                onChange={(event) => setField("deliveryDate", event.target.value)}
              />
            </label>

            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Minimum order quantity</span>
              </div>
              <input
                type="number"
                min="1"
                className="input input-bordered"
                value={windowConfig.minimumOrderQuantity}
                onChange={(event) =>
                  setField("minimumOrderQuantity", Number(event.target.value || 1))
                }
              />
            </label>

            <div className="form-control w-full md:col-span-2">
              <div className="label">
                <span className="label-text">Pickup address</span>
              </div>
              <input
                className="input input-bordered w-full"
                value={windowConfig.pickupAddress || ""}
                onChange={(event) => handlePickupInputChange(event.target.value)}
                placeholder="Start typing the pickup address and choose the best match"
                autoComplete="off"
              />
              <div className="mt-2 text-xs opacity-70">
                Choose a suggestion so delivery distance is calculated from the correct origin.
              </div>
              {pickupSuggestions.length > 0 && (
                <div className="mt-2 rounded-2xl border border-base-300 bg-base-100 shadow-lg">
                  <ul className="max-h-72 overflow-y-auto py-2">
                    {pickupSuggestions.map((suggestion) => (
                      <li key={suggestion.placeId}>
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-base-200"
                          onClick={() => handlePickupSuggestionSelect(suggestion)}
                        >
                          <div className="font-medium">{suggestion.primaryText}</div>
                          {suggestion.secondaryText && (
                            <div className="text-sm opacity-70">{suggestion.secondaryText}</div>
                          )}
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
                  <div className="mt-1 opacity-80">{selectedPickupPlace.formattedAddress}</div>
                  <a
                    className="link link-primary mt-3 inline-block"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPickupPlace.formattedAddress)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps
                  </a>
                </div>
              )}
              {pickupLookupError && <div className="mt-2 text-sm text-error">{pickupLookupError}</div>}
            </div>
          </div>

          <div className="rounded-2xl border border-base-300 bg-base-200 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Delivery charges</h2>
                <p className="text-sm opacity-70">
                  Set the fee bands that apply based on the Google Maps driving distance from the pickup address.
                </p>
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={addDeliveryBand}>
                Add distance slab
              </button>
            </div>

            <div className="space-y-3">
              {windowConfig.deliveryBands.map((band, index) => (
                <div key={`delivery-band-${index}`} className="grid gap-3 rounded-xl bg-base-100 p-4 md:grid-cols-4">
                  <label className="form-control w-full">
                    <div className="label py-0">
                      <span className="label-text">From km</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="input input-bordered"
                      value={band.minDistanceKm}
                      onChange={(event) =>
                        updateDeliveryBand(index, "minDistanceKm", Number(event.target.value || 0))
                      }
                    />
                  </label>

                  <label className="form-control w-full">
                    <div className="label py-0">
                      <span className="label-text">To km</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="input input-bordered"
                      value={band.maxDistanceKm}
                      onChange={(event) =>
                        updateDeliveryBand(index, "maxDistanceKm", Number(event.target.value || 0))
                      }
                    />
                  </label>

                  <label className="form-control w-full">
                    <div className="label py-0">
                      <span className="label-text">Fee</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input input-bordered"
                      value={band.fee}
                      onChange={(event) =>
                        updateDeliveryBand(index, "fee", Number(event.target.value || 0))
                      }
                    />
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost text-error"
                      onClick={() => removeDeliveryBand(index)}
                    >
                      Remove slab
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-base-300 bg-base-200 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">SKUs</h2>
                <p className="text-sm opacity-70">
                  Add the products customers can order, set the price, and remove anything you no longer sell.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="badge badge-outline">{activeItemCount} active SKU(s)</div>
                <button type="button" className="btn btn-sm btn-primary" onClick={addItem}>
                  Add SKU
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {windowConfig.allowedItems.map((item, index) => (
                <div key={`sku-row-${index}`} className="rounded-xl bg-base-100 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <label className="label cursor-pointer justify-start gap-3">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={Boolean(item.isActive)}
                        onChange={(event) => updateItem(index, "isActive", event.target.checked)}
                      />
                      <span className="label-text">Active</span>
                    </label>

                    <button
                      type="button"
                      className="btn btn-sm btn-ghost text-error"
                      onClick={() => removeItem(index)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <label className="form-control w-full">
                      <div className="label py-0">
                        <span className="label-text">Product name</span>
                      </div>
                      <input
                        className="input input-bordered"
                        value={item.productName}
                        onChange={(event) => updateItem(index, "productName", event.target.value)}
                      />
                    </label>

                    <label className="form-control w-full">
                      <div className="label py-0">
                        <span className="label-text">SKU</span>
                      </div>
                      <input
                        className="input input-bordered"
                        value={item.sku}
                        onChange={(event) => updateItem(index, "sku", event.target.value.toUpperCase())}
                      />
                    </label>

                    <label className="form-control w-full">
                      <div className="label py-0">
                        <span className="label-text">Price</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input input-bordered"
                        value={item.unitPrice}
                        onChange={(event) => updateItem(index, "unitPrice", Number(event.target.value || 0))}
                      />
                    </label>

                    <label className="form-control w-full">
                      <div className="label py-0">
                        <span className="label-text">Max per order</span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        className="input input-bordered"
                        value={item.maxPerOrder ?? 10}
                        onChange={(event) => updateItem(index, "maxPerOrder", Number(event.target.value || 10))}
                      />
                    </label>
                  </div>

                  <label className="form-control mt-3 w-full">
                    <div className="label py-0">
                      <span className="label-text">Description</span>
                    </div>
                    <textarea
                      className="textarea textarea-bordered"
                      rows={3}
                      value={item.notes || ""}
                      onChange={(event) => updateItem(index, "notes", event.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-base-300 p-4 text-sm">
            <h2 className="font-semibold">Razorpay skeleton</h2>
            <p className="mt-2 opacity-80">
              The backend routes are scaffolded for creating Razorpay orders and handling webhooks. Add
              <code> RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>, and
              <code> RAZORPAY_WEBHOOK_SECRET</code> in <code>.env.local</code> before wiring the frontend checkout modal.
            </p>
          </div>

          <div className="card-actions items-center justify-between">
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save admin settings"}
            </button>
            {windowConfig.id && <div className="badge badge-outline">Window ID: {windowConfig.id}</div>}
          </div>

          {message && (
            <div className="alert alert-success">
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
