"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatSubscriptionDuration,
  SUBSCRIPTION_CADENCES,
  getSubscriptionDurationOptions,
} from "@/libs/subscriptions";
import { useRazorpayCheckout } from "@/components/RazorpayCheckout";

const MAX_QTY = 10;
const MIN_TOTAL_QTY = 4;
const MAX_TOTAL_QTY = 10;

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

const getDefaultComboId = (comboOptions = []) =>
  comboOptions.find((combo) => combo.isFeatured)?.id || comboOptions[0]?.id || "";

const getInitialSelectionMode = ({
  initialValues,
  initialSelectionMode,
  comboOptions,
}) => {
  if (initialValues?.selectionMode === "combo" && comboOptions.length > 0) {
    return "combo";
  }

  if (initialSelectionMode === "combo" && comboOptions.length > 0) {
    return "combo";
  }

  return "custom";
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

const serializeRazorpaySubscriptionResult = (paymentResult = {}) => {
  const rawPaymentResult =
    paymentResult && typeof paymentResult === "object" ? paymentResult : {};

  return {
    razorpay_subscription_id:
      rawPaymentResult.razorpay_subscription_id ||
      rawPaymentResult.subscriptionId ||
      rawPaymentResult.subscription_id ||
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
      razorpay_subscription_id:
        rawPaymentResult.razorpay_subscription_id ||
        rawPaymentResult.subscriptionId ||
        rawPaymentResult.subscription_id ||
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

export default function SubscriptionForm({
  catalogItems = [],
  comboOptions = [],
  deliveryWindowId = "",
  pickupAddress = "",
  deliveryBands = [],
  currency = "INR",
  initialValues,
  initialSelectionMode = "combo",
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
  const [durationWeeks, setDurationWeeks] = useState(
    Number(initialValues?.durationWeeks || 4)
  );
  const [selectionMode, setSelectionMode] = useState(() =>
    getInitialSelectionMode({
      initialValues,
      initialSelectionMode,
      comboOptions,
    })
  );
  const [selectedComboId, setSelectedComboId] = useState(
    initialValues?.comboId || getDefaultComboId(comboOptions)
  );
  const [cart, setCart] = useState(() =>
    buildCartFromCatalog(catalogItems, initialValues?.items || [])
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [didEmailChange, setDidEmailChange] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
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
  const [isCancelled, setIsCancelled] = useState(
    Boolean(
      initialValues?.status === "cancelled" ||
        initialValues?.billing?.status === "cancelled"
    )
  );
  const initialEmailRef = useRef(initialValues?.email || "");
  const isCompletingPaymentRef = useRef(false);
  const loadRazorpay = useRazorpayCheckout();

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
    setDurationWeeks(Number(initialValues.durationWeeks || 4));
    setSelectionMode(
      getInitialSelectionMode({
        initialValues,
        initialSelectionMode,
        comboOptions,
      })
    );
    setSelectedComboId(initialValues.comboId || getDefaultComboId(comboOptions));
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
    setIsCancelled(
      Boolean(
        initialValues?.status === "cancelled" ||
          initialValues?.billing?.status === "cancelled"
      )
    );
    initialEmailRef.current = initialValues.email || "";
  }, [catalogItems, comboOptions, initialSelectionMode, initialValues, mode]);

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

  const selectedCombo = useMemo(
    () => comboOptions.find((combo) => combo.id === selectedComboId) || null,
    [comboOptions, selectedComboId]
  );

  const customSelectedItems = useMemo(
    () =>
      lineup
        .filter((product) => Number(cart[product.sku] || 0) > 0)
        .map((product) => ({
          sku: product.sku,
          productName: product.name,
          quantity: Number(cart[product.sku] || 0),
          unitPrice: product.unitPrice,
          lineTotal: Number(cart[product.sku] || 0) * product.unitPrice,
        })),
    [cart, lineup]
  );

  const comboSelectedItems = useMemo(
    () =>
      (selectedCombo?.items || []).map((item) => ({
        sku: item.sku,
        productName: item.productName,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        lineTotal: Number(item.lineTotal || 0),
      })),
    [selectedCombo]
  );

  const effectiveSelectionMode =
    selectionMode === "combo" && selectedCombo ? "combo" : "custom";
  const selectedItems =
    effectiveSelectionMode === "combo" ? comboSelectedItems : customSelectedItems;

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
  const durationOptions = getSubscriptionDurationOptions(cadence);
  const durationIsValid = durationOptions.includes(Number(durationWeeks || 0));
  const canSubmit = Boolean(
    !billingLocked &&
      !isCancelled &&
      !isSubmitting &&
      customer.name.trim() &&
      customer.email.trim() &&
      customer.phone.trim() &&
      customer.address.trim() &&
      cadence &&
      durationIsValid &&
      selectedItems.length > 0 &&
      totalQuantity >= MIN_TOTAL_QTY &&
      totalQuantity <= MAX_TOTAL_QTY &&
      !isQuotingDelivery &&
      !deliveryError &&
      !needsAddressSelection
  );

  useEffect(() => {
    if (!durationOptions.includes(Number(durationWeeks || 0))) {
      setDurationWeeks(durationOptions[0] || 4);
    }
  }, [cadence, durationOptions, durationWeeks]);

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
    setDurationWeeks(4);
    setSelectionMode(comboOptions.length > 0 ? initialSelectionMode : "custom");
    setSelectedComboId(getDefaultComboId(comboOptions));
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

  const applySubscriptionState = (nextSubscription) => {
    if (!nextSubscription) {
      return;
    }

    setCustomer({
      ...initialCustomer,
      name: nextSubscription.name || "",
      email: nextSubscription.email || "",
      phone: nextSubscription.phone || "",
      address: nextSubscription.address || "",
    });
    setCadence(nextSubscription.cadence || "weekly");
    setDurationWeeks(Number(nextSubscription.durationWeeks || 4));
    setSelectionMode(nextSubscription.selectionMode || "custom");
    setSelectedComboId(nextSubscription.comboId || getDefaultComboId(comboOptions));
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
    setIsCancelled(
      Boolean(
        nextSubscription.status === "cancelled" ||
          nextSubscription.billing?.status === "cancelled"
      )
    );
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (effectiveSelectionMode === "combo" && !selectedCombo) {
      setError("Please choose a box before continuing.");
      return;
    }

    if (selectedItems.length === 0) {
      setError("Choose a box or add a few bottles before continuing.");
      return;
    }

    if (totalQuantity < MIN_TOTAL_QTY || totalQuantity > MAX_TOTAL_QTY) {
      setError("Please choose between 4 and 10 bottles.");
      return;
    }

    if (!durationIsValid) {
      setError("Please choose how long you&apos;d like this plan to run.");
      return;
    }

    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim() || !customer.address.trim()) {
      setError("Please fill in name, email, phone number, and address.");
      return;
    }

    if (deliveryConfigured && !storedPlaceId && !selectedPlace?.placeId) {
      setError("Please choose your address from the suggestions so we can confirm delivery.");
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
            durationWeeks,
            selectionMode: effectiveSelectionMode,
            comboId: effectiveSelectionMode === "combo" ? selectedCombo?.id || "" : "",
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

      if (data.razorpay?.isConfigured && data.checkoutToken) {
        const Razorpay = await loadRazorpay();

        if (!Razorpay) {
          throw new Error("Razorpay checkout is unavailable right now.");
        }

        const checkout = new Razorpay({
          ...data.razorpay,
          handler: async (paymentResult) => {
            isCompletingPaymentRef.current = true;

            try {
              const serializedPaymentResult =
                serializeRazorpaySubscriptionResult(paymentResult);
              const verifyResponse = await fetch("/api/subscription/payment", {
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
                  verifyData?.error || "Payment verification failed."
                );
              }

              setError("");
              setSuccessMessage(
                verifyData.confirmationMessage ||
                  "Auto-pay is confirmed and your subscription is ready."
              );
              applySubscriptionState(verifyData.subscription);

              if (mode === "create") {
                resetForCreate();
              }
            } catch (verificationError) {
              setError(
                verificationError.message ||
                  "Payment setup was completed, but confirmation has not synced yet."
              );
            } finally {
              isCompletingPaymentRef.current = false;
              setIsSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => {
              if (isCompletingPaymentRef.current) {
                return;
              }

              setError(
                "Payment setup was not completed, so the subscription is still waiting for confirmation."
              );
              setIsSubmitting(false);
            },
          },
        });

        checkout.open();
        return;
      }

      setSuccessMessage(data.message || "Subscription saved.");

      if (mode === "create") {
        resetForCreate();
      } else if (data.subscription) {
        applySubscriptionState(data.subscription);
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

  const cancelSubscription = async () => {
    const shouldCancel = window.confirm("Cancel this subscription and stop its Razorpay mandate?");

    if (!shouldCancel) {
      return;
    }

    setIsCancelling(true);
    setError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/subscription/edit", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Could not cancel subscription."));
      }

      const data = await response.json();
      setSuccessMessage(data.message || "Your plan has been cancelled.");
      setBillingLocked(true);
      setIsCancelled(true);
    } catch (cancelError) {
      setError(cancelError.message || "Could not cancel subscription.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7d74]">
              Choose Your Box
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#53675d]">
              Start with one of our ready-to-go boxes, or build your own with the drinks you love.
            </p>
          </div>
          <div className="badge border-[#d1c4b0] bg-[#f7f1e6] text-[#2f5d49]">
            4 to 10 bottles
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            className={`rounded-2xl border p-5 text-left transition ${
              effectiveSelectionMode === "combo"
                ? "border-[#2f5d49] bg-[#eef4ee]"
                : "border-[#d8cdbb] bg-[#fffaf1]"
            }`}
            disabled={billingLocked || comboOptions.length === 0}
            onClick={() => setSelectionMode("combo")}
          >
            <div className="text-lg font-semibold text-[#2f4a3e]">Ready-to-go boxes</div>
            <p className="mt-2 text-sm leading-7 text-[#53675d]">
              Easy picks put together by us if you want the quickest way to get started.
            </p>
          </button>
          <button
            type="button"
            className={`rounded-2xl border p-5 text-left transition ${
              effectiveSelectionMode === "custom"
                ? "border-[#2f5d49] bg-[#eef4ee]"
                : "border-[#d8cdbb] bg-[#fffaf1]"
            }`}
            disabled={billingLocked}
            onClick={() => setSelectionMode("custom")}
          >
            <div className="text-lg font-semibold text-[#2f4a3e]">Build your own box</div>
            <p className="mt-2 text-sm leading-7 text-[#53675d]">
              Mix and match your favourites and choose exactly what goes into each delivery.
            </p>
          </button>
        </div>

        {effectiveSelectionMode === "combo" && comboOptions.length > 0 && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {comboOptions.map((combo) => {
              const isActive = combo.id === selectedComboId;

              return (
                <button
                  key={combo.id}
                  type="button"
                  className={`rounded-2xl border p-5 text-left transition ${
                    isActive
                      ? "border-[#2f5d49] bg-[#eef4ee] shadow-md"
                      : "border-[#d8cdbb] bg-[#fffaf1]"
                  }`}
                  disabled={billingLocked}
                  onClick={() => setSelectedComboId(combo.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[#2f4a3e]">{combo.name}</h3>
                      <p className="mt-2 text-sm leading-7 text-[#53675d]">
                        {combo.description || "A handpicked selection from Good Gut Hut."}
                      </p>
                    </div>
                    {combo.isFeatured && (
                      <div className="badge border-[#c3b190] bg-[#fff1ce] text-[#6a5422]">
                        Featured
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#5f7068]">
                    <span className="rounded-full bg-[#f1e8d8] px-3 py-1">
                      {combo.totalQuantity} bottles
                    </span>
                    <span className="rounded-full bg-[#f1e8d8] px-3 py-1">
                      {currency} {Number(combo.subtotal || 0).toFixed(2)}
                    </span>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-[#456154]">
                    {(combo.items || []).map((item) => (
                      <li key={`${combo.id}-${item.sku}`}>
                        {item.productName} x {item.quantity}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        )}

        {selectionMode === "combo" && comboOptions.length === 0 && (
          <div className="mt-6 rounded-2xl border border-[#d8cdbb] bg-[#fffaf1] p-4 text-sm text-[#53675d]">
            We don&apos;t have any ready-to-go boxes live right now, so you can build your own below.
          </div>
        )}
      </section>

      {effectiveSelectionMode === "custom" && (
        <section className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7d74]">
                Build Your Own Box
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[#53675d]">
                Choose any mix of drinks you like, with at least 4 bottles and up to 10 bottles in each delivery.
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
                          Add
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
      )}

      <form
        onSubmit={onSubmit}
        className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8"
      >
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="label">
                <span className="label-text text-[#365244]">How Often</span>
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
            <div>
              <div className="label">
                <span className="label-text text-[#365244]">How Long</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {durationOptions.map((option) => {
                  const isActive = Number(durationWeeks) === option;

                  return (
                    <button
                      key={`${cadence}-${option}`}
                      type="button"
                      disabled={billingLocked}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? "border-[#2f5d49] bg-[#355a45] text-[#f7f1e6] shadow-md"
                          : "border-[#d1c4b0] bg-[#fffaf1] text-[#365244] hover:border-[#a98f6f]"
                      }`}
                      onClick={() => setDurationWeeks(option)}
                    >
                      {formatSubscriptionDuration(option)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-[#6b7d74]">
                Your recurring payment will automatically end when this plan is complete.
              </div>
            </div>
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
            <label className="form-control">
              <div className="label">
                <span className="label-text text-[#365244]">Apartment / Door No.</span>
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
                <span className="label-text text-[#365244]">Address *</span>
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
                Choose the closest match so we can confirm delivery to your area and calculate charges.
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
                <div className="font-medium">Delivery address confirmed</div>
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
                  Your Plan
                </div>
                <p className="mt-2 text-sm leading-7 text-[#53675d]">
                  {effectiveSelectionMode === "combo"
                    ? `You&apos;ve chosen ${selectedCombo?.name || "one of our ready-to-go boxes"}.`
                    : "You&apos;re creating your own box from the current menu."}
                </p>
              </div>
              <div className="badge border-[#d1c4b0] bg-[#f7f1e6] text-[#2f5d49]">
                {totalQuantity} bottle{totalQuantity === 1 ? "" : "s"} selected
              </div>
            </div>

            {selectedItems.length === 0 ? (
              <p className="mt-4 text-sm opacity-70">
                Nothing selected yet. Choose a box or add a few bottles to continue.
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
                <span>How often</span>
                <span>{SUBSCRIPTION_CADENCES.find((item) => item.value === cadence)?.label || cadence}</span>
              </div>
              <div className="flex justify-between">
                <span>How long</span>
                <span>{formatSubscriptionDuration(durationWeeks)}</span>
              </div>
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
                <div className="text-[#6b7d74]">Please choose one of the suggested addresses to continue.</div>
              )}
              {totalQuantity < MIN_TOTAL_QTY && (
                <div className="text-[#8a5a20]">
                  Add {MIN_TOTAL_QTY - totalQuantity} more bottle{MIN_TOTAL_QTY - totalQuantity === 1 ? "" : "s"} to reach the minimum box size.
                </div>
              )}
              {totalQuantity > MAX_TOTAL_QTY && (
                <div className="text-error">Please bring this down to 10 bottles or fewer.</div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span>Total per delivery</span>
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
              This plan already has an active recurring payment attached. If you need help making billing changes, email us and we&apos;ll sort it out.
            </div>
          )}

          {isCancelled && (
            <div className="rounded-2xl border border-[#ddcfb6] bg-[#f7f1e6] px-4 py-4 text-sm text-[#52655b]">
              This plan has been cancelled.
            </div>
          )}

          {didEmailChange && (
            <div className="rounded-2xl border border-[#ddcfb6] bg-[#f7f1e6] px-4 py-4 text-sm text-[#52655b]">
              We&apos;ve sent a fresh update link to your new email address.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[#5f7068]">
              No login needed. We&apos;ll email you a secure link so you can update or cancel your plan anytime.
            </div>
            <div className="flex flex-wrap gap-3">
              {mode === "edit" && !isCancelled && (
                <button
                  type="button"
                  className="btn btn-outline text-error"
                  disabled={isCancelling || isSubmitting}
                  onClick={cancelSubscription}
                >
                  {isCancelling ? "Cancelling..." : "Cancel plan"}
                </button>
              )}
              <button type="submit" disabled={!canSubmit} className="btn btn-primary min-w-[220px]">
                {isSubmitting
                  ? mode === "edit"
                    ? "Saving..."
                    : "Taking you to payment..."
                  : isCancelled
                    ? "Plan cancelled"
                  : mode === "edit"
                    ? "Save updates"
                    : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
