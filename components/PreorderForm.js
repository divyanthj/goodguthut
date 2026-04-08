"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRazorpayCheckout } from "@/components/RazorpayCheckout";

const initialCustomer = {
  customerName: "",
  email: "",
  phone: "",
  addressLine2: "",
  address: "",
};

const MAX_QTY = 10;
const SUPPORT_PHONE = "+919916331569";
const normalizeDiscountCode = (value = "") => value.trim().toUpperCase().replace(/\s+/g, "");

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

const formatDeliveryDate = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const serializeRazorpayPaymentResult = (paymentResult = {}) => {
  const rawPaymentResult =
    paymentResult && typeof paymentResult === "object" ? paymentResult : {};

  return {
    razorpay_order_id:
      rawPaymentResult.razorpay_order_id ||
      rawPaymentResult.orderId ||
      rawPaymentResult.order_id ||
      "",
    razorpay_payment_id:
      rawPaymentResult.razorpay_payment_id ||
      rawPaymentResult.paymentId ||
      rawPaymentResult.payment_id ||
      "",
    razorpay_signature:
      rawPaymentResult.razorpay_signature ||
      rawPaymentResult.signature ||
      rawPaymentResult.paymentSignature ||
      "",
    paymentResult: {
      razorpay_order_id:
        rawPaymentResult.razorpay_order_id ||
        rawPaymentResult.orderId ||
        rawPaymentResult.order_id ||
        "",
      razorpay_payment_id:
        rawPaymentResult.razorpay_payment_id ||
        rawPaymentResult.paymentId ||
        rawPaymentResult.payment_id ||
        "",
      razorpay_signature:
        rawPaymentResult.razorpay_signature ||
        rawPaymentResult.signature ||
        rawPaymentResult.paymentSignature ||
        "",
    },
  };
};

export default function PreorderForm({
  selectedItems,
  preorderWindowId,
  currency = "INR",
  deliveryBands = [],
  pickupAddress = "",
  pickupAddressDisplay = "",
  allowFreePickup = false,
  freeDeliveryThreshold = null,
  onOrderPlaced,
  updateQty,
  minTotalQuantity,
  allowTestPreorder = false,
}) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successState, setSuccessState] = useState(null);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [isQuotingDelivery, setIsQuotingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState("");
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [addressSessionToken, setAddressSessionToken] = useState(() => createSessionToken());
  const [isPickup, setIsPickup] = useState(false);
  const isCompletingPaymentRef = useRef(false);
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
  const requiresSelectedAddress = deliveryConfigured && !isPickup;
  const fullAddress = buildFullAddress(customer.addressLine2, customer.address);
  const appliedDiscountCode = appliedDiscount?.code || "";
  const discountAmount = Number(appliedDiscount?.discountAmount || 0);
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const numericFreeDeliveryThreshold = Number(freeDeliveryThreshold);
  const hasFreeDeliveryThreshold =
    Number.isFinite(numericFreeDeliveryThreshold) && numericFreeDeliveryThreshold > 0;
  const qualifiesForFreeDelivery = hasFreeDeliveryThreshold && subtotal >= numericFreeDeliveryThreshold;
  const total = discountedSubtotal + Number(isPickup ? 0 : deliveryQuote?.deliveryFee || 0);
  const hasMandatoryFields =
    customer.customerName.trim() && customer.phone.trim() && (isPickup || customer.address.trim());
  const meetsMinQty = totalQuantity >= minTotalQuantity;
  const needsAddressSelection =
    requiresSelectedAddress && customer.address.trim() && !selectedPlace;
  const isBlockedByDelivery =
    deliveryConfigured &&
    !isPickup &&
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
    if (successState) {
      setIsSubmitting(false);
      isCompletingPaymentRef.current = false;
    }
  }, [successState]);

  useEffect(() => {
    if (!allowFreePickup && isPickup) {
      setIsPickup(false);
    }
  }, [allowFreePickup, isPickup]);

  const applyDiscountCode = useCallback(
    async (codeValue = discountCodeInput, { silent = false } = {}) => {
      const normalizedCode = normalizeDiscountCode(codeValue);

      if (!normalizedCode) {
        setAppliedDiscount(null);
        setDiscountError("");
        return;
      }

      if (selectedItems.length === 0) {
        setAppliedDiscount(null);
        setDiscountError("Add at least one item before applying a discount code.");
        return;
      }

      if (!silent) {
        setIsApplyingDiscount(true);
      }
      setDiscountError("");

      try {
        const response = await fetch("/api/preorder/discount", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            preorderWindowId,
            items: selectedItems,
            discountCode: normalizedCode,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            getApiErrorMessage(response, data, "Could not apply discount code.")
          );
        }

        setAppliedDiscount(data.discount || null);
        setDiscountCodeInput(data.discount?.code || normalizedCode);
      } catch (applyError) {
        setAppliedDiscount(null);
        setDiscountError(applyError.message || "Could not apply discount code.");
      } finally {
        if (!silent) {
          setIsApplyingDiscount(false);
        }
      }
    },
    [discountCodeInput, preorderWindowId, selectedItems]
  );

  useEffect(() => {
    if (isPickup) {
      setAddressSuggestions([]);
      setIsLoadingSuggestions(false);
      setAddressLookupError("");
      return undefined;
    }

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
  }, [customer.address, addressSessionToken, isPickup, selectedPlace]);

  useEffect(() => {
    if (!appliedDiscountCode || selectedItems.length === 0) {
      if (selectedItems.length === 0) {
        setAppliedDiscount(null);
      }
      return;
    }

    const syncDiscount = async () => {
      await applyDiscountCode(appliedDiscountCode, { silent: true });
    };

    syncDiscount();
  }, [appliedDiscountCode, applyDiscountCode, preorderWindowId, selectedItems]);

  useEffect(() => {
    setDeliveryError("");

    if (!deliveryConfigured || isPickup || !selectedPlace) {
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
            orderSubtotal: subtotal,
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
  }, [selectedPlace, preorderWindowId, deliveryConfigured, addressSessionToken, fullAddress, isPickup, subtotal]);

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

  const resetAfterSuccess = () => {
    setCustomer(initialCustomer);
    setSelectedPlace(null);
    setAddressSuggestions([]);
    setAddressSessionToken(createSessionToken());
    setDeliveryQuote(null);
    setDeliveryError("");
    setIsPickup(false);
    setDiscountCodeInput("");
    setAppliedDiscount(null);
    setDiscountError("");
    onOrderPlaced?.();
  };

  const submitPreorder = async (e, { testBypassPayment = false } = {}) => {
    e.preventDefault();
    setError("");

    if (selectedItems.length === 0) {
      setError("Please add at least one item from the lineup before placing a preorder.");
      return;
    }

    if (!hasMandatoryFields) {
      setError(isPickup ? "Please fill in name and phone number." : "Please fill in name, phone number, and address.");
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
          address: isPickup ? "" : fullAddress,
          isPickup,
          preorderWindowId,
          discountCode: discountCodeInput,
          deliveryPlaceId: selectedPlace?.placeId || "",
          addressSessionToken,
          items: selectedItems,
          testBypassPayment,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(response, data, "Could not place preorder.")
        );
      }

      if (data.checkoutToken && data.razorpay?.isConfigured && Number(data.total || 0) > 0) {
        const Razorpay = await loadRazorpay();

        if (!Razorpay) {
          throw new Error("Razorpay checkout is unavailable right now.");
        }

        const checkout = new Razorpay({
          ...data.razorpay,
          handler: async (paymentResult) => {
            isCompletingPaymentRef.current = true;
            try {
              const serializedPaymentResult = serializeRazorpayPaymentResult(paymentResult);
              const verifyResponse = await fetch("/api/preorder/payment", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  ...serializedPaymentResult,
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

              setSuccessState({
                customerName: customer.customerName,
                email: customer.email,
                deliveryDate: verifyData?.preorder?.deliveryDate || "",
                isPaid: true,
                emailDeliveryStatus: verifyData?.emailDelivery?.status || "unknown",
              });
              resetAfterSuccess();
            } catch (verificationError) {
              isCompletingPaymentRef.current = false;
              setIsSubmitting(false);
              setError(
                verificationError.message ||
                  "Payment was captured, but confirmation has not synced yet."
              );
            }
          },
          modal: {
            ondismiss: () => {
              if (isCompletingPaymentRef.current) {
                return;
              }

              setError("Payment was not completed, so the preorder was not created.");
              setIsSubmitting(false);
            },
          },
        });

        checkout.open();
        return;
      }

      setSuccessState({
        customerName: customer.customerName,
        email: customer.email,
        deliveryDate: data?.preorder?.deliveryDate || "",
        isPaid: Boolean(testBypassPayment || data.paymentStatus === "paid"),
        emailDeliveryStatus:
          data?.emailDelivery?.status ||
          (testBypassPayment ? "unknown" : "not_applicable"),
      });
      resetAfterSuccess();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (e) => {
    await submitPreorder(e, { testBypassPayment: false });
  };

  if (successState) {
    return (
      <section className="card mt-6 overflow-hidden border border-[#d8cdbb] bg-[#fbf7f0]/96 shadow-xl">
        <div className="bg-gradient-to-br from-[#2f4a3e] via-[#3b5b4a] to-[#567764] px-6 py-10 text-[#f7f1e6] md:px-10">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d8ccb8]">
            Preorder confirmed
          </div>
          <h3 className="mt-3 text-3xl font-semibold md:text-4xl">
            Thank you for your preorder
          </h3>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#efe6d8] md:text-base">
            {successState.customerName
              ? `${successState.customerName}, your Good Gut Hut order is in and confirmed.`
              : "Your Good Gut Hut order is in and confirmed."}{" "}
            We&apos;ll prepare your batch with care and keep things smooth from here.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 md:px-10">
          <div className="rounded-2xl border border-[#dfd1be] bg-[#fffdf8] p-5 text-[#365244] shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7d74]">
              What happens next
            </div>
            <p className="mt-3 text-sm leading-7">
              {successState.isPaid
                ? "Your payment has been received and your preorder has been locked in."
                : "Your preorder is received and we&apos;ll contact you shortly to confirm the next steps."}
            </p>
            {successState.deliveryDate && (
              <p className="mt-3 text-sm leading-7">
                Delivery date: <span className="font-semibold">{formatDeliveryDate(successState.deliveryDate)}</span>
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-[#dfd1be] bg-[#f7f1e6] p-5 text-[#365244] shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b7d74]">
              Receipt and support
            </div>
            <p className="mt-3 text-sm leading-7">
              {successState.emailDeliveryStatus === "sent" && successState.email
                ? `A receipt and confirmation have been sent to ${successState.email}.`
                : successState.emailDeliveryStatus === "failed" && successState.email
                  ? `Your order is confirmed, but we could not send the receipt email to ${successState.email} just yet.`
                  : successState.email
                    ? `Your order is confirmed for ${successState.email}.`
                    : "Your order is confirmed. If you want a receipt by email next time, add your email address during checkout."}
            </p>
            <p className="mt-3 text-sm leading-7">
              Need anything before your order is ready? Call or WhatsApp <span className="font-semibold">{SUPPORT_PHONE}</span>.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mt-6 bg-base-100 shadow-xl">
      <div className="card-body gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          {allowFreePickup && pickupAddressDisplay && (
            <div className="md:col-span-2 rounded-2xl border border-base-300 bg-base-200 p-4">
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={isPickup}
                  onChange={(event) => {
                    const nextIsPickup = event.target.checked;
                    setIsPickup(nextIsPickup);
                    setError("");
                    setDeliveryError("");
                    setAddressLookupError("");
                    setAddressSuggestions([]);
                    setSelectedPlace(null);
                    setDeliveryQuote(null);
                  }}
                />
                <span className="label-text font-medium">Pick up this order for free</span>
              </label>
              {isPickup && (
                <div className="mt-3 rounded-xl border border-base-300 bg-base-100 p-4 text-sm">
                  <div className="font-medium">Pickup address</div>
                  <div className="mt-1 opacity-80">{pickupAddressDisplay}</div>
                </div>
              )}
            </div>
          )}
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
          {!isPickup && (
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
          )}
          {!isPickup && (
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
                Choose a suggested address so we can confirm delivery and show the final delivery charge.
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
          )}
          {!isPickup && selectedPlace?.formattedAddress && (
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
            <div className="rounded-xl border border-base-300 bg-base-100 p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <label className="form-control flex-1">
                  <div className="label py-0">
                    <span className="label-text">Discount code</span>
                  </div>
                  <input
                    className="input input-bordered"
                    value={discountCodeInput}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setDiscountCodeInput(nextValue);
                      if (normalizeDiscountCode(nextValue) !== appliedDiscount?.code) {
                        setAppliedDiscount(null);
                      }
                      setDiscountError("");
                    }}
                    placeholder="SUMMER10"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={isApplyingDiscount || selectedItems.length === 0 || !discountCodeInput.trim()}
                  onClick={() => applyDiscountCode()}
                >
                  {isApplyingDiscount ? "Applying..." : "Apply code"}
                </button>
              </div>
              {appliedDiscount?.code && (
                <div className="mt-3 text-sm text-success">
                  {appliedDiscount.code} applied for {Number(appliedDiscount.amount || 0)}% off the subtotal.
                </div>
              )}
              {discountError && <div className="mt-2 text-sm text-error">{discountError}</div>}
            </div>
            {discountAmount > 0 && (
              <div className="text-sm font-medium text-success">
                Discount: -{currency} {discountAmount.toFixed(2)}
              </div>
            )}
            {discountAmount > 0 && (
              <div className="text-sm font-medium opacity-90">
                Subtotal after discount: {currency} {discountedSubtotal.toFixed(2)}
              </div>
            )}
            <div className="text-sm font-medium opacity-90">
              {isPickup
                ? `Pickup: ${currency} 0.00`
                : `Delivery: ${
                    deliveryQuote?.isFreeDelivery
                      ? "Free"
                      : qualifiesForFreeDelivery
                      ? "Free"
                      : deliveryQuote
                        ? `${currency} ${Number(deliveryQuote.deliveryFee).toFixed(2)}`
                        : isQuotingDelivery
                          ? "Calculating..."
                          : `${currency} 0.00`
                  }`}
            </div>
            {!isPickup && hasFreeDeliveryThreshold && (
              <div className="text-sm opacity-80">
                {qualifiesForFreeDelivery
                  ? `Your preorder qualifies for free delivery because your subtotal is above ${currency} ${numericFreeDeliveryThreshold.toFixed(2)} before discounts. We’ll confirm delivery availability once you choose your address.`
                  : `Delivery is free for preorders above ${currency} ${numericFreeDeliveryThreshold.toFixed(2)} before discounts.`}
              </div>
            )}
            {!isPickup && deliveryQuote?.distanceKm > 0 && (
              <div className="text-sm opacity-80">
                Distance: {Number(deliveryQuote.distanceKm).toFixed(1)} km
              </div>
            )}
            {!isPickup && deliveryError && <div className="text-sm text-error">{deliveryError}</div>}
            {!isPickup && !deliveryError && needsAddressSelection && (
              <div className="text-sm opacity-70">Pick one of the suggested addresses to continue.</div>
            )}
            {!isPickup && !deliveryError && deliveryConfigured && !customer.address.trim() && (
              <div className="text-sm opacity-70">Enter your address to calculate delivery.</div>
            )}
            <div className="text-sm font-semibold">Total: {currency} {total.toFixed(2)}</div>
          </div>
        </div>

        <div className="card-actions items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!canSubmit} className="btn btn-primary">
              {isSubmitting ? "Processing..." : "Place preorder"}
            </button>
            {allowTestPreorder && (
              <button
                type="button"
                disabled={!canSubmit || isSubmitting}
                className="btn btn-outline"
                onClick={(event) => submitPreorder(event, { testBypassPayment: true })}
              >
                {isSubmitting ? "Processing..." : "Test place preorder"}
              </button>
            )}
          </div>
          {selectedItems.length > 0 && <div className="badge badge-outline">{selectedItems.length} item(s) selected</div>}
        </div>
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
      </div>
    </form>
  );
}
