"use client";

import { useEffect, useMemo, useState } from "react";
import { useRazorpayCheckout } from "@/components/RazorpayCheckout";

const initialCustomer = {
  customerName: "",
  email: "",
  phone: "",
  addressLine2: "",
  address: "",
};

const MAX_QTY = 10;

const createSessionToken = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getApiErrorMessage = (response, data, fallbackMessage) => {
  if (response?.status === 429) {
    return (
      data?.error ||
      "Too many attempts right now. Please wait a moment and try again."
    );
  }

  if (response?.status === 403) {
    return (
      data?.error ||
      "This request was blocked by the site's security checks."
    );
  }

  return data?.error || fallbackMessage;
};

const buildFullAddress = (addressLine2, address) => {
  const unit = addressLine2.trim();
  const baseAddress = address.trim();

  if (!unit) {
    return baseAddress;
  }

  if (!baseAddress) {
    return unit;
  }

  return `${unit}, ${baseAddress}`;
};

export default function PreorderForm({
  selectedItems,
  preorderWindowId,
  currency = "INR",
  deliveryBands = [],
  pickupAddress = "",
  onOrderPlaced,
  updateQty,
  minTotalQuantity,
}) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [isQuotingDelivery, setIsQuotingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [addressLookupError, setAddressLookupError] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [addressSessionToken, setAddressSessionToken] = useState(() => createSessionToken());
  const loadRazorpay = useRazorpayCheckout();

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
  const requiresSelectedAddress = deliveryConfigured;
  const fullAddress = buildFullAddress(customer.addressLine2, customer.address);
  const total = subtotal + Number(deliveryQuote?.deliveryFee || 0);
  const hasMandatoryFields =
    customer.customerName.trim() && customer.phone.trim() && customer.address.trim();
  const meetsMinQty = totalQuantity >= minTotalQuantity;
  const needsAddressSelection =
    requiresSelectedAddress && customer.address.trim() && !selectedPlace;
  const isBlockedByDelivery =
    deliveryConfigured &&
    customer.address.trim() &&
    (isQuotingDelivery || deliveryQuote?.isDeliverable === false || Boolean(deliveryError) || needsAddressSelection);
  const canSubmit = Boolean(
    hasMandatoryFields &&
      meetsMinQty &&
      selectedItems.length > 0 &&
      !isSubmitting &&
      !isBlockedByDelivery
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
          throw new Error(
            getApiErrorMessage(response, data, "Could not load address suggestions.")
          );
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
  }, [customer.address, addressSessionToken, selectedPlace]);

  useEffect(() => {
    setDeliveryError("");

    if (!deliveryConfigured || !selectedPlace) {
      setDeliveryQuote(null);
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
            preorderWindowId,
            address: fullAddress,
            placeId: selectedPlace.placeId,
            sessionToken: addressSessionToken,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            getApiErrorMessage(response, data, "Could not calculate delivery fee.")
          );
        }

        setDeliveryQuote(data);
        setDeliveryError(
          data.isDeliverable === false ? data.reason || "We do not deliver there yet." : ""
        );
      } catch (quoteError) {
        setDeliveryQuote(null);
        setDeliveryError(quoteError.message || "Could not calculate delivery fee.");
      } finally {
        setIsQuotingDelivery(false);
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [selectedPlace, preorderWindowId, deliveryConfigured, addressSessionToken, fullAddress]);

  const handleAddressInputChange = (value) => {
    setCustomer((prev) => ({ ...prev, address: value }));
    if (selectedPlace) {
      setAddressSessionToken(createSessionToken());
    }
    setSelectedPlace(null);
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
        throw new Error(
          getApiErrorMessage(response, data, "Could not verify that address.")
        );
      }

      setSelectedPlace(data.place);
      setCustomer((prev) => ({ ...prev, address: data.place.formattedAddress }));
      setAddressSuggestions([]);
    } catch (selectionError) {
      setAddressLookupError(selectionError.message || "Could not verify that address.");
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (selectedItems.length === 0) {
      setError("Please add at least one item from the lineup before placing a preorder.");
      return;
    }

    if (!hasMandatoryFields) {
      setError("Please fill in name, phone number, and address.");
      return;
    }

    if (!meetsMinQty) {
      setError(`Minimum preorder quantity is ${minTotalQuantity}.`);
      return;
    }

    if (requiresSelectedAddress && !selectedPlace) {
      setError("Please select your delivery address from the suggestions.");
      return;
    }

    if (deliveryQuote?.isDeliverable === false) {
      setError(deliveryQuote.reason || "We do not deliver there yet.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/preorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customer,
          address: fullAddress,
          preorderWindowId,
          deliveryPlaceId: selectedPlace?.placeId || "",
          addressSessionToken,
          items: selectedItems,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(response, data, "Could not place preorder.")
        );
      }

      if (data.razorpay?.isConfigured && Number(data.total || 0) > 0) {
        const Razorpay = await loadRazorpay();

        if (!Razorpay) {
          throw new Error("Razorpay checkout is unavailable right now.");
        }

        const checkout = new Razorpay({
          ...data.razorpay,
          handler: async (paymentResult) => {
            try {
              const verifyResponse = await fetch("/api/preorder/payment", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  ...paymentResult,
                  checkoutToken: data.checkoutToken,
                }),
              });
              const verifyData = await verifyResponse.json();

              if (!verifyResponse.ok) {
                throw new Error(
                  getApiErrorMessage(
                    verifyResponse,
                    verifyData,
                    "Payment verification failed."
                  )
                );
              }

              setMessage(
                verifyData.confirmationMessage ||
                  "Payment received. Your preorder is confirmed."
              );
              setCustomer(initialCustomer);
              setSelectedPlace(null);
              setAddressSuggestions([]);
              setAddressSessionToken(createSessionToken());
              setDeliveryQuote(null);
              setDeliveryError("");
              onOrderPlaced?.();
            } catch (verificationError) {
              setError(
                verificationError.message ||
                  "Payment was captured, but confirmation has not synced yet."
              );
            } finally {
              setIsSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => {
              setError("Payment was not completed, so the preorder was not created.");
              setIsSubmitting(false);
            },
          },
        });

        checkout.open();
        return;
      }

      setMessage(
        data.confirmationMessage ||
          "Preorder received. We will contact you on WhatsApp or by text to confirm your order before payment."
      );
      setCustomer(initialCustomer);
      setSelectedPlace(null);
      setAddressSuggestions([]);
      setAddressSessionToken(createSessionToken());
      setDeliveryQuote(null);
      setDeliveryError("");
      onOrderPlaced?.();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card mt-6 bg-base-100 shadow-xl">
      <div className="card-body gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Name *</span>
            </div>
            <input
              className="input input-bordered w-full"
              required
              value={customer.customerName}
              onChange={(e) => setCustomer((prev) => ({ ...prev, customerName: e.target.value }))}
            />
          </label>
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Email</span>
            </div>
            <input
              type="email"
              className="input input-bordered w-full"
              value={customer.email}
              onChange={(e) => setCustomer((prev) => ({ ...prev, email: e.target.value }))}
            />
          </label>
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Phone Number *</span>
            </div>
            <input
              className="input input-bordered w-full"
              required
              value={customer.phone}
              onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </label>
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Flat / Door No.</span>
            </div>
            <input
              className="input input-bordered w-full"
              value={customer.addressLine2}
              onChange={(e) =>
                setCustomer((prev) => ({ ...prev, addressLine2: e.target.value }))
              }
              placeholder="F202, A-304, Villa 4"
            />
          </label>
          <div className="form-control w-full md:col-span-2">
            <div className="label">
              <span className="label-text">Building / Street Address *</span>
            </div>
            <input
              className="input input-bordered w-full"
              required
              value={customer.address}
              onChange={(e) => handleAddressInputChange(e.target.value)}
              placeholder="Start typing your address and choose the best match"
              autoComplete="off"
            />
            {deliveryConfigured && (
              <div className="mt-2 text-xs opacity-70">
                Choose a suggestion so we can verify the address on Google Maps before quoting delivery.
              </div>
            )}
            {addressSuggestions.length > 0 && (
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
          {selectedPlace?.formattedAddress && (
            <div className="md:col-span-2 rounded-2xl border border-base-300 bg-base-200 p-4 text-sm">
              <div className="font-medium">Verified on Google Maps</div>
              <div className="mt-1 opacity-80">{fullAddress}</div>
              <div className="mt-3 overflow-hidden rounded-xl border border-base-300 bg-base-100">
                <iframe
                  title="Matched delivery location"
                  className="h-56 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&z=15&output=embed`}
                />
              </div>
              <a
                className="link link-primary mt-3 inline-block"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            </div>
          )}
        </div>

        <div className="card bg-base-200 card-compact">
          <div className="card-body gap-3">
            <h3 className="card-title text-lg">Your cart</h3>
            {selectedItems.length === 0 ? (
              <p className="text-sm opacity-70">No items selected yet. Add products from the lineup above.</p>
            ) : (
              <ul className="space-y-2">
                {selectedItems.map((item) => (
                  <li key={item.sku} className="flex items-center justify-between rounded-lg bg-base-100 px-3 py-2">
                    <div>
                      <div>{item.productName}</div>
                      <div className="text-xs opacity-60">
                        {currency} {Number(item.unitPrice || 0).toFixed(2)} each
                      </div>
                    </div>
                    <div className="join">
                      <button
                        type="button"
                        className="btn btn-sm join-item"
                        onClick={() => updateQty(item.sku, Number(item.quantity) - 1)}
                      >
                        -
                      </button>
                      <button type="button" className="btn btn-sm join-item" disabled>
                        {item.quantity}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm join-item"
                        onClick={() => updateQty(item.sku, Number(item.quantity) + 1)}
                        disabled={Number(item.quantity) >= MAX_QTY}
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-sm opacity-80">Total quantity: {totalQuantity}</div>
            <div className="text-sm opacity-80">Minimum quantity required: {minTotalQuantity}</div>
            <div className="text-sm font-medium opacity-90">Subtotal: {currency} {subtotal.toFixed(2)}</div>
            <div className="text-sm font-medium opacity-90">
              Delivery: {deliveryQuote ? `${currency} ${Number(deliveryQuote.deliveryFee).toFixed(2)}` : isQuotingDelivery ? "Calculating..." : `${currency} 0.00`}
            </div>
            {deliveryQuote?.distanceKm > 0 && (
              <div className="text-sm opacity-80">
                Distance: {Number(deliveryQuote.distanceKm).toFixed(1)} km
              </div>
            )}
            {deliveryError && <div className="text-sm text-error">{deliveryError}</div>}
            {!deliveryError && needsAddressSelection && (
              <div className="text-sm opacity-70">Pick one of the suggested addresses to continue.</div>
            )}
            {!deliveryError && deliveryConfigured && !customer.address.trim() && (
              <div className="text-sm opacity-70">Enter your address to calculate delivery.</div>
            )}
            <div className="text-sm font-semibold">Total: {currency} {total.toFixed(2)}</div>
          </div>
        </div>

        <div className="card-actions items-center justify-between">
          <button type="submit" disabled={!canSubmit} className="btn btn-primary">
            {isSubmitting ? "Processing..." : "Place preorder"}
          </button>
          {selectedItems.length > 0 && <div className="badge badge-outline">{selectedItems.length} item(s) selected</div>}
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
  );
}
