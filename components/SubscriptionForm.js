"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SUBSCRIPTION_CADENCES } from "@/libs/subscriptions";

const MAX_QTY = 10;

const initialCustomer = {
  name: "",
  email: "",
  phone: "",
  addressLine2: "",
  address: "",
};

const createSessionToken = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getApiErrorMessage = async (response, fallbackMessage) => {
  try {
    const data = await response.json();
    return data?.error || data?.message || fallbackMessage;
  } catch (_error) {
    return fallbackMessage;
  }
};

const buildCartFromCatalog = (catalogItems = [], initialItems = []) => {
  const initialMap = new Map(
    (initialItems || []).map((item) => [String(item.sku || "").toUpperCase(), Number(item.quantity || 0)])
  );

  return Object.fromEntries(
    catalogItems.map((item) => [item.sku, Number(initialMap.get(item.sku) || 0)])
  );
};

const buildFullAddress = (addressLine2, address) => {
  const unit = String(addressLine2 || "").trim();
  const baseAddress = String(address || "").trim();

  if (!unit) {
    return baseAddress;
  }

  if (!baseAddress) {
    return unit;
  }

  return `${unit}, ${baseAddress}`;
};

export default function SubscriptionForm({
  catalogItems = [],
  deliveryWindowId = "",
  pickupAddress = "",
  deliveryBands = [],
  currency = "INR",
  initialValues,
  mode = "create",
  token = "",
}) {
  const [customer, setCustomer] = useState(() => ({
    ...initialCustomer,
    ...(initialValues
      ? {
          name: initialValues.name || "",
          email: initialValues.email || "",
          phone: initialValues.phone || "",
          address: initialValues.address || "",
        }
      : {}),
  }));
  const [cadence, setCadence] = useState(initialValues?.cadence || "weekly");
  const [cart, setCart] = useState(() =>
    buildCartFromCatalog(catalogItems, initialValues?.items || [])
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [didEmailChange, setDidEmailChange] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [storedPlaceId, setStoredPlaceId] = useState(initialValues?.deliveryPlaceId || "");
  const [addressSessionToken, setAddressSessionToken] = useState(() => createSessionToken());
  const [deliveryQuote, setDeliveryQuote] = useState(
    initialValues
      ? {
          isDeliverable: true,
          deliveryFee: Number(initialValues.deliveryFee || 0),
          distanceKm: Number(initialValues.deliveryDistanceKm || 0),
          normalizedAddress: initialValues.normalizedDeliveryAddress || initialValues.address || "",
        }
      : null
  );
  const [deliveryError, setDeliveryError] = useState("");
  const [isQuotingDelivery, setIsQuotingDelivery] = useState(false);
  const [hasVerifiedAddress, setHasVerifiedAddress] = useState(
    Boolean(initialValues?.deliveryPlaceId || initialValues?.normalizedDeliveryAddress)
  );
  const [billingLocked, setBillingLocked] = useState(
    Boolean(
      mode === "edit" &&
        initialValues?.billing?.subscriptionId &&
        !["created", "cancelled", "completed", "expired"].includes(initialValues?.billing?.status || "")
    )
  );
  const initialEmailRef = useRef(initialValues?.email || "");

  useEffect(() => {
    if (!initialValues) {
      return;
    }

    setCustomer({
      ...initialCustomer,
      name: initialValues.name || "",
      email: initialValues.email || "",
      phone: initialValues.phone || "",
      address: initialValues.address || "",
    });
    setCadence(initialValues.cadence || "weekly");
    setCart(buildCartFromCatalog(catalogItems, initialValues.items || []));
    setStoredPlaceId(initialValues.deliveryPlaceId || "");
    setDeliveryQuote({
      isDeliverable: true,
      deliveryFee: Number(initialValues.deliveryFee || 0),
      distanceKm: Number(initialValues.deliveryDistanceKm || 0),
      normalizedAddress: initialValues.normalizedDeliveryAddress || initialValues.address || "",
    });
    setHasVerifiedAddress(
      Boolean(initialValues.deliveryPlaceId || initialValues.normalizedDeliveryAddress)
    );
    setBillingLocked(
      Boolean(
        mode === "edit" &&
          initialValues?.billing?.subscriptionId &&
          !["created", "cancelled", "completed", "expired"].includes(initialValues?.billing?.status || "")
      )
    );
    initialEmailRef.current = initialValues.email || "";
  }, [catalogItems, initialValues, mode]);

  const lineup = useMemo(
    () =>
      catalogItems
        .filter((item) => item?.sku && item.status !== "archived")
        .map((item) => ({
          sku: item.sku,
          name: item.name,
          note: item.notes || "",
          unitPrice: Number(item.unitPrice || 0),
        })),
    [catalogItems]
  );

  const selectedItems = useMemo(
    () =>
      lineup
        .filter((product) => Number(cart[product.sku] || 0) > 0)
        .map((product) => ({
          sku: product.sku,
          productName: product.name,
          quantity: Number(cart[product.sku] || 0),
          unitPrice: product.unitPrice,
        })),
    [cart, lineup]
  );

  const totalQuantity = useMemo(
    () => selectedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [selectedItems]
  );

  const subtotal = useMemo(
    () =>
      selectedItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0
      ),
    [selectedItems]
  );

  const deliveryConfigured = Boolean(pickupAddress && deliveryBands.length > 0);
  const fullAddress = buildFullAddress(customer.addressLine2, customer.address);
  const total = subtotal + Number(deliveryQuote?.deliveryFee || 0);
  const needsAddressSelection =
    deliveryConfigured && customer.address.trim() && !selectedPlace && !hasVerifiedAddress;
  const canSubmit = Boolean(
    !billingLocked &&
      !isSubmitting &&
      customer.name.trim() &&
      customer.email.trim() &&
      customer.phone.trim() &&
      customer.address.trim() &&
      cadence &&
      selectedItems.length > 0 &&
      totalQuantity > 0 &&
      !isQuotingDelivery &&
      !deliveryError &&
      !needsAddressSelection
  );

  useEffect(() => {
    const input = customer.address.trim();

    if (input.length < 3) {
      setAddressSuggestions([]);
      setIsLoadingSuggestions(false);
      setAddressLookupError("");
      return undefined;
    }

    if (selectedPlace && selectedPlace.formattedAddress === customer.address) {
      setAddressSuggestions([]);
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      setAddressLookupError("");

      try {
        const response = await fetch("/api/preorder/address-autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input,
            sessionToken: addressSessionToken,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Could not load address suggestions.");
        }

        setAddressSuggestions(data.suggestions || []);
      } catch (autocompleteError) {
        setAddressSuggestions([]);
        setAddressLookupError(
          autocompleteError.message || "Could not load address suggestions."
        );
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [addressSessionToken, customer.address, selectedPlace]);

  useEffect(() => {
    setDeliveryError("");

    if (!deliveryConfigured || !selectedPlace) {
      setIsQuotingDelivery(false);
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      setIsQuotingDelivery(true);

      try {
        const response = await fetch("/api/preorder/delivery-quote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            preorderWindowId: deliveryWindowId,
            address: fullAddress,
            placeId: selectedPlace.placeId,
            sessionToken: addressSessionToken,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Could not calculate delivery fee.");
        }

        setDeliveryQuote(data);
        setDeliveryError(
          data.isDeliverable === false ? data.reason || "We do not deliver there yet." : ""
        );
        setHasVerifiedAddress(true);
        setStoredPlaceId(selectedPlace.placeId);
      } catch (quoteError) {
        setDeliveryQuote(null);
        setDeliveryError(quoteError.message || "Could not calculate delivery fee.");
      } finally {
        setIsQuotingDelivery(false);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [addressSessionToken, deliveryConfigured, deliveryWindowId, fullAddress, selectedPlace]);

  const updateQty = (sku, nextQty) => {
    if (billingLocked) {
      return;
    }

    const boundedQty = Math.max(0, Math.min(MAX_QTY, nextQty));
    setCart((prev) => ({ ...prev, [sku]: boundedQty }));
  };

  const handleAddressInputChange = (value) => {
    setCustomer((prev) => ({ ...prev, address: value }));
    if (selectedPlace || hasVerifiedAddress) {
      setAddressSessionToken(createSessionToken());
    }
    setSelectedPlace(null);
    setStoredPlaceId("");
    setHasVerifiedAddress(false);
    setDeliveryQuote(null);
    setDeliveryError("");
    setAddressLookupError("");
  };

  const handleSuggestionSelect = async (suggestion) => {
    setIsLoadingSuggestions(true);
    setDeliveryError("");
    setAddressLookupError("");

    try {
      const response = await fetch("/api/preorder/address-place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: suggestion.placeId,
          sessionToken: addressSessionToken,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Could not verify that address.");
      }

      setSelectedPlace(data.place);
      setStoredPlaceId(data.place.placeId || suggestion.placeId);
      setHasVerifiedAddress(true);
      setCustomer((prev) => ({ ...prev, address: data.place.formattedAddress }));
      setAddressSuggestions([]);
    } catch (selectionError) {
      setAddressLookupError(selectionError.message || "Could not verify that address.");
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const resetForCreate = () => {
    setCustomer(initialCustomer);
    setCadence("weekly");
    setCart(buildCartFromCatalog(catalogItems, []));
    setSelectedPlace(null);
    setStoredPlaceId("");
    setHasVerifiedAddress(false);
    setAddressSuggestions([]);
    setAddressSessionToken(createSessionToken());
    setDeliveryQuote(null);
    setDeliveryError("");
    setAddressLookupError("");
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (selectedItems.length === 0) {
      setError("Add at least one product quantity before continuing.");
      return;
    }

    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !customer.address.trim()) {
      setError("Please fill in name, email, phone number, and address.");
      return;
    }

    if (deliveryConfigured && !storedPlaceId && !selectedPlace?.placeId) {
      setError("Please select your delivery address from the suggestions.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        mode === "edit" ? "/api/subscription/edit" : "/api/subscription",
        {
          method: mode === "edit" ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: fullAddress,
            deliveryPlaceId: selectedPlace?.placeId || storedPlaceId,
            addressSessionToken,
            cadence,
            items: selectedItems,
            token,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            mode === "edit"
              ? "Could not update subscription."
              : "Could not create subscription."
          )
        );
      }

      const data = await response.json();
      setSuccessMessage(data.message || "Subscription saved.");
      setCheckoutUrl(data.checkoutUrl || "");

      if (mode === "create") {
        resetForCreate();
      } else if (data.subscription) {
        const nextSubscription = data.subscription;
        setCustomer({
          ...initialCustomer,
          name: nextSubscription.name || "",
          email: nextSubscription.email || "",
          phone: nextSubscription.phone || "",
          address: nextSubscription.address || "",
        });
        setCadence(nextSubscription.cadence || "weekly");
        setCart(buildCartFromCatalog(catalogItems, nextSubscription.items || []));
        setStoredPlaceId(nextSubscription.deliveryPlaceId || "");
        setHasVerifiedAddress(
          Boolean(nextSubscription.deliveryPlaceId || nextSubscription.normalizedDeliveryAddress)
        );
        setDeliveryQuote({
          isDeliverable: true,
          deliveryFee: Number(nextSubscription.deliveryFee || 0),
          distanceKm: Number(nextSubscription.deliveryDistanceKm || 0),
          normalizedAddress:
            nextSubscription.normalizedDeliveryAddress || nextSubscription.address || "",
        });
        setBillingLocked(
          Boolean(
            nextSubscription.billing?.subscriptionId &&
              !["created", "cancelled", "completed", "expired"].includes(
                nextSubscription.billing?.status || ""
              )
          )
        );
      }

      if (customer.email.trim().toLowerCase() !== initialEmailRef.current.trim().toLowerCase()) {
        setDidEmailChange(true);
      }
    } catch (submitError) {
      setError(submitError.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7d74]">
              Choose your lineup
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#53675d]">
              Set quantities per drink, then confirm your recurring cadence and delivery address below.
            </p>
          </div>
          <div className="badge border-[#d1c4b0] bg-[#f7f1e6] text-[#2f5d49]">
            {currency} pricing
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lineup.map((drink) => {
            const qty = Number(cart[drink.sku] || 0);

            return (
              <article
                key={drink.sku}
                className="rounded-2xl border border-[#d8cdbb] bg-[#fffaf1] p-5 shadow-sm"
              >
                <div className="flex h-full flex-col">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-[#2f4a3e]">{drink.name}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#53675d]">{drink.note}</p>
                    <div className="mt-3 text-sm font-medium text-[#5f7068]">
                      {currency} {drink.unitPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-5 flex justify-end">
                    {qty === 0 ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={billingLocked}
                        onClick={() => updateQty(drink.sku, 1)}
                      >
                        Add to cart
                      </button>
                    ) : (
                      <div className="join">
                        <button
                          type="button"
                          className="btn btn-sm join-item"
                          disabled={billingLocked}
                          onClick={() => updateQty(drink.sku, qty - 1)}
                        >
                          -
                        </button>
                        <button type="button" className="btn btn-sm join-item" disabled>
                          {qty}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm join-item"
                          disabled={billingLocked || qty >= MAX_QTY}
                          onClick={() => updateQty(drink.sku, qty + 1)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <form
        onSubmit={onSubmit}
        className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8"
      >
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="form-control">
              <div className="label">
                <span className="label-text text-[#365244]">Name *</span>
              </div>
              <input
                className="input input-bordered bg-[#fffdf8]"
                value={customer.name}
                onChange={(event) => setCustomer((prev) => ({ ...prev, name: event.target.value }))}
                required
                disabled={billingLocked}
              />
            </label>
            <label className="form-control">
              <div className="label">
                <span className="label-text text-[#365244]">Email *</span>
              </div>
              <input
                type="email"
                className="input input-bordered bg-[#fffdf8]"
                value={customer.email}
                onChange={(event) => setCustomer((prev) => ({ ...prev, email: event.target.value }))}
                required
                disabled={billingLocked}
              />
            </label>
            <label className="form-control">
              <div className="label">
                <span className="label-text text-[#365244]">Phone number *</span>
              </div>
              <input
                className="input input-bordered bg-[#fffdf8]"
                value={customer.phone}
                onChange={(event) => setCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                required
                disabled={billingLocked}
              />
            </label>
            <div>
              <div className="label">
                <span className="label-text text-[#365244]">Cadence</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {SUBSCRIPTION_CADENCES.map((option) => {
                  const isActive = cadence === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={billingLocked}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? "border-[#2f5d49] bg-[#355a45] text-[#f7f1e6] shadow-md"
                          : "border-[#d1c4b0] bg-[#fffaf1] text-[#365244] hover:border-[#a98f6f]"
                      }`}
                      onClick={() => setCadence(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="form-control">
              <div className="label">
                <span className="label-text text-[#365244]">Flat / Door No.</span>
              </div>
              <input
                className="input input-bordered bg-[#fffdf8]"
                value={customer.addressLine2}
                onChange={(event) =>
                  setCustomer((prev) => ({ ...prev, addressLine2: event.target.value }))
                }
                placeholder="F202, A-304, Villa 4"
                disabled={billingLocked}
              />
            </label>
            <div className="form-control md:col-span-2">
              <div className="label">
                <span className="label-text text-[#365244]">Building / Street Address *</span>
              </div>
              <input
                className="input input-bordered bg-[#fffdf8]"
                value={customer.address}
                onChange={(event) => handleAddressInputChange(event.target.value)}
                placeholder="Start typing your address and choose the best match"
                autoComplete="off"
                required
                disabled={billingLocked}
              />
              <div className="mt-2 text-xs text-[#6b7d74]">
                Choose a suggestion so we can verify the address and calculate the recurring delivery fee.
              </div>
              {addressSuggestions.length > 0 && !billingLocked && (
                <div className="mt-2 rounded-2xl border border-base-300 bg-base-100 shadow-lg">
                  <ul className="max-h-72 overflow-y-auto py-2">
                    {addressSuggestions.map((suggestion) => (
                      <li key={suggestion.placeId}>
                        <button
                          type="button"
                          className="w-full px-4 py-3 text-left hover:bg-base-200"
                          onClick={() => handleSuggestionSelect(suggestion)}
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
              {isLoadingSuggestions && customer.address.trim().length >= 3 && (
                <div className="mt-2 text-xs opacity-70">Looking up addresses...</div>
              )}
              {addressLookupError && (
                <div className="mt-2 text-sm text-error">{addressLookupError}</div>
              )}
            </div>
            {hasVerifiedAddress && fullAddress && (
              <div className="md:col-span-2 rounded-2xl border border-base-300 bg-base-200 p-4 text-sm">
                <div className="font-medium">Verified delivery location</div>
                <div className="mt-1 opacity-80">
                  {deliveryQuote?.normalizedAddress || fullAddress}
                </div>
                <div className="mt-3 overflow-hidden rounded-xl border border-base-300 bg-base-100">
                  <iframe
                    title="Matched delivery location"
                    className="h-56 w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps?q=${encodeURIComponent(
                      deliveryQuote?.normalizedAddress || fullAddress
                    )}&z=15&output=embed`}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#ddcfb6] bg-[#fffdf8] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5f7068]">
                  Subscription summary
                </div>
                <p className="mt-2 text-sm leading-7 text-[#53675d]">
                  Your recurring amount will be based on this lineup and delivery address.
                </p>
              </div>
              <div className="badge border-[#d1c4b0] bg-[#f7f1e6] text-[#2f5d49]">
                {totalQuantity} bottles selected
              </div>
            </div>

            {selectedItems.length === 0 ? (
              <p className="mt-4 text-sm opacity-70">
                No drinks selected yet. Add quantities from the lineup above.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th className="text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map((item) => (
                      <tr key={item.sku}>
                        <td>{item.productName}</td>
                        <td>{item.quantity}</td>
                        <td className="text-right">
                          {currency} {(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 grid gap-2 text-sm text-[#365244]">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{currency} {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>
                  {isQuotingDelivery
                    ? "Calculating..."
                    : `${currency} ${Number(deliveryQuote?.deliveryFee || 0).toFixed(2)}`}
                </span>
              </div>
              {deliveryQuote?.distanceKm > 0 && (
                <div className="flex justify-between">
                  <span>Distance</span>
                  <span>{Number(deliveryQuote.distanceKm).toFixed(1)} km</span>
                </div>
              )}
              {deliveryError && <div className="text-error">{deliveryError}</div>}
              {!deliveryError && needsAddressSelection && (
                <div className="text-[#6b7d74]">Pick one of the suggested addresses to continue.</div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span>Recurring total</span>
                <span>{currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {successMessage && (
            <div className="alert border-[#cfe2d0] bg-[#eef7ef] text-[#264f35]">
              <span>{successMessage}</span>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          {billingLocked && (
            <div className="rounded-2xl border border-[#ddcfb6] bg-[#f7f1e6] px-4 py-4 text-sm text-[#52655b]">
              This subscription already has an active Razorpay mandate. Please email support if you need to change the billing setup.
            </div>
          )}

          {didEmailChange && (
            <div className="rounded-2xl border border-[#ddcfb6] bg-[#f7f1e6] px-4 py-4 text-sm text-[#52655b]">
              Your email changed, so we sent a fresh edit link to the new address.
            </div>
          )}

          {checkoutUrl && (
            <div className="rounded-2xl border border-[#d6c6ae] bg-[#fff8ec] p-5 text-[#365244]">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7d74]">
                Complete recurring payment setup
              </div>
              <p className="mt-3 text-sm leading-7">
                Finish your Razorpay auto-pay authorization to activate this subscription.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Continue to Razorpay
                </a>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[#5f7068]">
              No login required. We&apos;ll email you a secure edit link after submission.
            </div>
            <button type="submit" disabled={!canSubmit} className="btn btn-primary min-w-[220px]">
              {isSubmitting
                ? mode === "edit"
                  ? "Saving..."
                  : "Starting subscription..."
                : mode === "edit"
                  ? "Save subscription changes"
                  : "Start subscription"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
