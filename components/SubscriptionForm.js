"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  canEditSubscriptionBilling,
  getSubscriptionDurationConfig,
  formatSubscriptionDuration,
  SUBSCRIPTION_CADENCES,
  getSubscriptionDurationOptions,
} from "@/libs/subscriptions";
import { useRazorpayCheckout } from "@/components/RazorpayCheckout";
import { formatDeliveryDaysOfWeek } from "@/libs/subscription-delivery-days";
import {
  formatMinimumLeadDays,
  formatSubscriptionDate,
  getDefaultSubscriptionStartDate,
  getNextSubscriptionDeliveryDate,
  listPlannedSubscriptionDeliveryDates,
  listAvailableSubscriptionStartDates,
} from "@/libs/subscription-schedule";
import { MAX_TOTAL_QTY, ONE_TIME_MIN_TOTAL_QTY } from "@/libs/order-quantity";

const MAX_QTY = MAX_TOTAL_QTY;
const LOCKED_SUBSCRIPTION_CADENCE = "weekly";

const buildRecurringEligibility = ({
  selectedItems = [],
  cadence = "",
  durationWeeks = 0,
  startDate = "",
  recurringMinTotalQuantity = 6,
}) => {
  if (selectedItems.length === 0) {
    return { isEligible: false, reason: "" };
  }

  const totalQuantity = selectedItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  if (totalQuantity < recurringMinTotalQuantity || totalQuantity > MAX_TOTAL_QTY) {
    return {
      isEligible: false,
      reason: `Recurring is available once your selection is between ${recurringMinTotalQuantity} and ${MAX_TOTAL_QTY} bottles.`,
    };
  }

  let totalCount = 0;

  try {
    totalCount = getSubscriptionDurationConfig(cadence, durationWeeks).totalCount;
  } catch (_error) {
    return {
      isEligible: false,
      reason: "Select a valid recurring duration to enable recurring checkout.",
    };
  }

  const plannedDeliveryDates = listPlannedSubscriptionDeliveryDates({
    startDate,
    cadence,
    totalCount,
  });

  if (!plannedDeliveryDates.length) {
    return {
      isEligible: false,
      reason: "Choose a valid first delivery date to enable recurring checkout.",
    };
  }

  const invalidSeasonalItem = selectedItems.find((item) => {
    if ((item.skuType || "perennial") !== "seasonal") {
      return false;
    }

    const cutoffDate = String(item.recurringCutoffDate || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
      return true;
    }

    return plannedDeliveryDates.some((deliveryDate) => deliveryDate >= cutoffDate);
  });

  if (invalidSeasonalItem) {
    if (!invalidSeasonalItem.recurringCutoffDate) {
      return {
        isEligible: false,
        reason:
          "Recurring is only available when every selected item is available for the full plan duration.",
      };
    }

    return {
      isEligible: false,
      reason: `Recurring requires full-plan item availability. One or more seasonal items are only available before ${invalidSeasonalItem.recurringCutoffDate}.`,
    };
  }

  return { isEligible: true, reason: "" };
};

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

const buildInitialComboCart = ({ initialValues, comboOptions }) => {
  const initialComboId = String(initialValues?.comboId || "").trim();

  if (
    initialValues?.selectionMode === "combo" &&
    initialComboId &&
    comboOptions.some((combo) => combo.id === initialComboId)
  ) {
    return { [initialComboId]: 1 };
  }

  return {};
};

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

export default function SubscriptionForm({
  catalogItems = [],
  comboOptions = [],
  deliveryWindowId = "",
  pickupAddress = "",
  deliveryBands = [],
  deliveryDaysOfWeek = [],
  minimumLeadDays = 3,
  recurringMinTotalQuantity = 6,
  freeDeliveryThreshold = null,
  availableStartDates = [],
  defaultStartDate = "",
  currency = "INR",
  initialValues,
  initialSelectionMode = "combo",
  mode = "create",
  token = "",
}) {
  const [wantsRecurring, setWantsRecurring] = useState(mode === "edit");
  const isRecurringMode = mode === "edit" || wantsRecurring;
  const isOneTimeMode = !isRecurringMode;
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
  const [cadence, setCadence] = useState(LOCKED_SUBSCRIPTION_CADENCE);
  const [durationWeeks, setDurationWeeks] = useState(
    Number(initialValues?.durationWeeks || 4)
  );
  const [showStartDateOptions, setShowStartDateOptions] = useState(false);
  const [selectionMode, setSelectionMode] = useState(() =>
    getInitialSelectionMode({
      initialValues,
      initialSelectionMode,
      comboOptions,
    })
  );
  const [comboCart, setComboCart] = useState(() =>
    buildInitialComboCart({
      initialValues,
      comboOptions,
    })
  );
  const [pendingCheckout, setPendingCheckout] = useState(null);
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
    Boolean(mode === "edit" && !canEditSubscriptionBilling(initialValues?.billing || {}))
  );
  const [isCancelled, setIsCancelled] = useState(
    Boolean(
      initialValues?.status === "cancelled" ||
        initialValues?.billing?.status === "cancelled"
    )
  );
  const [recurringNotice, setRecurringNotice] = useState("");
  const initialEmailRef = useRef(initialValues?.email || "");
  const isCompletingPaymentRef = useRef(false);
  const loadRazorpay = useRazorpayCheckout();
  const effectiveStartDateOptions = useMemo(() => {
    if (Array.isArray(availableStartDates) && availableStartDates.length > 0) {
      return availableStartDates;
    }

    return listAvailableSubscriptionStartDates({
      deliveryDaysOfWeek,
      minimumLeadDays,
    });
  }, [availableStartDates, deliveryDaysOfWeek, minimumLeadDays]);
  const fallbackStartDate = useMemo(
    () =>
      defaultStartDate ||
      getDefaultSubscriptionStartDate({
        deliveryDaysOfWeek,
        minimumLeadDays,
      }),
    [defaultStartDate, deliveryDaysOfWeek, minimumLeadDays]
  );
  const [startDate, setStartDate] = useState(initialValues?.startDate || fallbackStartDate);

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
    setCadence(LOCKED_SUBSCRIPTION_CADENCE);
    setDurationWeeks(Number(initialValues.durationWeeks || 4));
    setSelectionMode(
      getInitialSelectionMode({
        initialValues,
        initialSelectionMode,
        comboOptions,
      })
    );
    setComboCart(
      buildInitialComboCart({
        initialValues,
        comboOptions,
      })
    );
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
      Boolean(mode === "edit" && !canEditSubscriptionBilling(initialValues?.billing || {}))
    );
    setIsCancelled(
      Boolean(
        initialValues?.status === "cancelled" ||
          initialValues?.billing?.status === "cancelled"
      )
    );
    initialEmailRef.current = initialValues.email || "";
    setStartDate(initialValues.startDate || fallbackStartDate);
    if (mode === "edit") {
      setWantsRecurring(true);
    }
  }, [catalogItems, comboOptions, fallbackStartDate, initialSelectionMode, initialValues, mode]);

  const lineup = useMemo(
    () =>
      catalogItems
        .filter((item) => item?.sku && item.status !== "archived")
        .map((item) => ({
          sku: item.sku,
          name: item.name,
          note: item.notes || "",
          unitPrice: Number(item.unitPrice || 0),
          skuType: item.skuType || "perennial",
          recurringCutoffDate: String(item.recurringCutoffDate || "").trim(),
        })),
    [catalogItems]
  );

  const selectedComboBreakdown = useMemo(
    () =>
      comboOptions
        .map((combo) => ({
          ...combo,
          quantity: Math.max(0, Number(comboCart[combo.id] || 0)),
        }))
        .filter((combo) => combo.quantity > 0),
    [comboCart, comboOptions]
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
          skuType: product.skuType || "perennial",
          recurringCutoffDate: String(product.recurringCutoffDate || "").trim(),
        })),
    [cart, lineup]
  );

  const comboSelectedItems = useMemo(() => {
    const itemsBySku = new Map();

    selectedComboBreakdown.forEach((combo) => {
      const comboQuantity = Math.max(0, Number(combo.quantity || 0));

      (combo.items || []).forEach((item) => {
        const sku = item.sku;
        const itemQty = Math.max(0, Number(item.quantity || 0));
        const totalItemQty = comboQuantity * itemQty;

        if (!sku || totalItemQty <= 0) {
          return;
        }

        const unitPrice = Math.max(0, Number(item.unitPrice || 0));
        const existing = itemsBySku.get(sku);

        if (existing) {
          existing.quantity += totalItemQty;
          existing.lineTotal = existing.quantity * existing.unitPrice;
          return;
        }

        itemsBySku.set(sku, {
          sku,
          productName: item.productName,
          quantity: totalItemQty,
          unitPrice,
          lineTotal: totalItemQty * unitPrice,
          skuType: item.skuType || "perennial",
          recurringCutoffDate: String(item.recurringCutoffDate || "").trim(),
        });
      });
    });

    return Array.from(itemsBySku.values());
  }, [selectedComboBreakdown]);

  const effectiveSelectionMode = selectionMode === "combo" ? "combo" : "custom";
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
  const effectiveDeliveryFee = isRecurringMode ? 0 : Number(deliveryQuote?.deliveryFee || 0);
  const total = subtotal + effectiveDeliveryFee;
  const needsAddressSelection =
    deliveryConfigured && customer.address.trim() && !selectedPlace && !hasVerifiedAddress;
  const durationOptions = getSubscriptionDurationOptions(cadence);
  const durationIsValid = isOneTimeMode
    ? true
    : durationOptions.includes(Number(durationWeeks || 0));
  const recurringEligibility = useMemo(
    () =>
      buildRecurringEligibility({
        selectedItems,
        cadence,
        durationWeeks,
        startDate: startDate || fallbackStartDate,
        recurringMinTotalQuantity,
      }),
    [
      cadence,
      durationWeeks,
      fallbackStartDate,
      recurringMinTotalQuantity,
      selectedItems,
      startDate,
    ]
  );
  const canOfferRecurringToggle =
    mode === "create" &&
    selectedItems.length > 0 &&
    recurringEligibility.isEligible;
  const effectiveStartDate = startDate || fallbackStartDate;
  const selectedStartDateOption = effectiveStartDateOptions.find(
    (option) => option.value === effectiveStartDate
  );
  const minimumQuantityForMode = isRecurringMode
    ? recurringMinTotalQuantity
    : ONE_TIME_MIN_TOTAL_QTY;
  const recurringToggleProgress = useMemo(() => {
    if (mode !== "create" || effectiveSelectionMode !== "custom" || totalQuantity <= 0) {
      return { message: "", tone: "" };
    }

    if (totalQuantity < ONE_TIME_MIN_TOTAL_QTY) {
      const remaining = ONE_TIME_MIN_TOTAL_QTY - totalQuantity;
      return {
        message: `${remaining} more bottle${remaining === 1 ? "" : "s"} to place this order.`,
        tone: "text-[#8a5a20]",
      };
    }

    if (totalQuantity < recurringMinTotalQuantity) {
      const recurringRemaining = recurringMinTotalQuantity - totalQuantity;
      return {
        message:
          totalQuantity === ONE_TIME_MIN_TOTAL_QTY
            ? `Order minimum reached. Add ${recurringRemaining} more for recurring.`
            : `Add ${recurringRemaining} more for recurring.`,
        tone: "text-[#8a5a20]",
      };
    }

    if (recurringEligibility.isEligible) {
      return {
        message: "You're eligible to make this recurring.",
        tone: "text-success",
      };
    }

    return { message: "", tone: "" };
  }, [
    effectiveSelectionMode,
    mode,
    recurringEligibility.isEligible,
    recurringMinTotalQuantity,
    totalQuantity,
  ]);
  const nextDeliveryDate = useMemo(
    () =>
      getNextSubscriptionDeliveryDate({
        startDate: effectiveStartDate,
        cadence,
      }),
    [cadence, effectiveStartDate]
  );
  const recurringPlannedDeliveryDates = useMemo(() => {
    if (!durationIsValid) {
      return [];
    }

    try {
      const { totalCount } = getSubscriptionDurationConfig(cadence, durationWeeks);
      return listPlannedSubscriptionDeliveryDates({
        startDate: effectiveStartDate,
        cadence,
        totalCount,
      });
    } catch (_error) {
      return [];
    }
  }, [cadence, durationIsValid, durationWeeks, effectiveStartDate]);
  const canSubmit = Boolean(
    !billingLocked &&
      !isCancelled &&
      !isSubmitting &&
      customer.name.trim() &&
      customer.email.trim() &&
      customer.phone.trim() &&
      customer.address.trim() &&
      (isOneTimeMode || cadence) &&
      durationIsValid &&
      selectedItems.length > 0 &&
      totalQuantity >= minimumQuantityForMode &&
      totalQuantity <= MAX_TOTAL_QTY &&
      effectiveStartDate &&
      !isQuotingDelivery &&
      !deliveryError &&
      !needsAddressSelection
  );

  useEffect(() => {
    if (mode !== "create") {
      return;
    }

    if (wantsRecurring && !canOfferRecurringToggle) {
      setWantsRecurring(false);
      setRecurringNotice(recurringEligibility.reason);
    }
  }, [
    canOfferRecurringToggle,
    mode,
    recurringEligibility.reason,
    selectedItems.length,
    wantsRecurring,
  ]);

  useEffect(() => {
    if (isOneTimeMode) {
      return;
    }

    if (!durationOptions.includes(Number(durationWeeks || 0))) {
      setDurationWeeks(durationOptions[0] || 4);
    }
  }, [cadence, durationOptions, durationWeeks, isOneTimeMode]);

  useEffect(() => {
    if (!effectiveStartDateOptions.length) {
      setStartDate("");
      return;
    }

    if (!effectiveStartDateOptions.some((option) => option.value === startDate)) {
      setStartDate(effectiveStartDateOptions[0].value);
    }
  }, [effectiveStartDateOptions, startDate]);

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
            orderSubtotal: subtotal,
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
  }, [
    addressSessionToken,
    deliveryConfigured,
    deliveryWindowId,
    fullAddress,
    selectedPlace,
    subtotal,
  ]);

  const updateQty = (sku, nextQty) => {
    if (billingLocked) {
      return;
    }

    const boundedQty = Math.max(0, Math.min(MAX_QTY, nextQty));
    setCart((prev) => ({ ...prev, [sku]: boundedQty }));
  };

  const updateComboQty = (comboId, nextQty) => {
    if (billingLocked) {
      return;
    }

    const normalizedQty = Math.max(0, Math.min(MAX_QTY, Number(nextQty || 0)));

    setComboCart((current) => {
      if (normalizedQty <= 0) {
        const rest = { ...current };
        delete rest[comboId];
        return rest;
      }

      return {
        ...current,
        [comboId]: normalizedQty,
      };
    });
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
    setCadence(LOCKED_SUBSCRIPTION_CADENCE);
    setDurationWeeks(4);
    setSelectionMode(comboOptions.length > 0 ? initialSelectionMode : "custom");
    setComboCart({});
    setCart(buildCartFromCatalog(catalogItems, []));
    setSelectedPlace(null);
    setStoredPlaceId("");
    setHasVerifiedAddress(false);
    setAddressSuggestions([]);
    setAddressSessionToken(createSessionToken());
    setDeliveryQuote(null);
    setDeliveryError("");
    setAddressLookupError("");
    setStartDate(fallbackStartDate);
    setShowStartDateOptions(false);
    setWantsRecurring(false);
    setRecurringNotice("");
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
    setCadence(LOCKED_SUBSCRIPTION_CADENCE);
    setDurationWeeks(Number(nextSubscription.durationWeeks || 4));
    const hasValidComboId =
      nextSubscription.selectionMode === "combo" &&
      String(nextSubscription.comboId || "").trim() &&
      comboOptions.some((combo) => combo.id === String(nextSubscription.comboId || "").trim());
    setSelectionMode(hasValidComboId ? "combo" : "custom");
    setComboCart(
      hasValidComboId ? { [String(nextSubscription.comboId || "").trim()]: 1 } : {}
    );
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
      Boolean(!canEditSubscriptionBilling(nextSubscription.billing || {}))
    );
    setIsCancelled(
      Boolean(
        nextSubscription.status === "cancelled" ||
          nextSubscription.billing?.status === "cancelled"
      )
    );
    setStartDate(nextSubscription.startDate || fallbackStartDate);
    setShowStartDateOptions(false);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (effectiveSelectionMode === "combo" && selectedComboBreakdown.length === 0) {
      setError("Please add at least one ready-to-go set before continuing.");
      return;
    }

    if (selectedItems.length === 0) {
      setError("Choose a set or add a few bottles before continuing.");
      return;
    }

    if (totalQuantity < minimumQuantityForMode || totalQuantity > MAX_TOTAL_QTY) {
      setError(
        `Please choose between ${minimumQuantityForMode} and ${MAX_TOTAL_QTY} bottles.`
      );
      return;
    }

    if (isRecurringMode && !recurringEligibility.isEligible) {
      setError(recurringEligibility.reason || "This selection is not eligible for recurring.");
      return;
    }

    if (!isOneTimeMode && !durationIsValid) {
      setError("Please choose how long you'd like this plan to run.");
      return;
    }

    if (!effectiveStartDate) {
      setError("We don't have a delivery date available in the next 30 days yet.");
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

    const singleComboSelection =
      effectiveSelectionMode === "combo" &&
      selectedComboBreakdown.length === 1 &&
      Number(selectedComboBreakdown[0]?.quantity || 0) === 1;

    const submissionSelectionMode = singleComboSelection ? "combo" : "custom";
    const submissionComboId = singleComboSelection ? selectedComboBreakdown[0].id : "";

    setIsSubmitting(true);

    try {
      const response = await fetch(
        mode === "edit" ? "/api/subscription/edit" : "/api/order-plan",
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
            durationWeeks: isOneTimeMode ? 0 : durationWeeks,
            startDate: effectiveStartDate,
            selectionMode: submissionSelectionMode,
            comboId: submissionComboId,
            items: selectedItems,
            mode: isOneTimeMode ? "one_time" : "recurring",
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
              : "Could not create order."
          )
        );
      }

      const data = await response.json();

      if (data.razorpay?.isConfigured && data.checkoutToken) {
        setPendingCheckout({
          checkoutToken: data.checkoutToken,
          razorpay: data.razorpay,
        });
        return;
      }

      setSuccessMessage(data.message || "Order saved.");

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

  const openRazorpayCheckout = async () => {
    if (!pendingCheckout?.checkoutToken || !pendingCheckout?.razorpay) {
      return;
    }

    const Razorpay = await loadRazorpay();

    if (!Razorpay) {
      setPendingCheckout(null);
      throw new Error("Razorpay checkout is unavailable right now.");
    }

    const checkout = new Razorpay({
      ...pendingCheckout.razorpay,
      handler: async (paymentResult) => {
        isCompletingPaymentRef.current = true;

        try {
          const serializedPaymentResult = isOneTimeMode
            ? serializeRazorpayPaymentResult(paymentResult)
            : serializeRazorpaySubscriptionResult(paymentResult);
          const verifyResponse = await fetch(
            mode === "edit" ? "/api/subscription/payment" : "/api/order-plan/payment",
            {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...serializedPaymentResult,
              checkoutToken: pendingCheckout.checkoutToken,
            }),
          });
          const verifyData = await verifyResponse.json();

          if (!verifyResponse.ok) {
            throw new Error(
              verifyData?.error || "Payment verification failed."
            );
          }

          setPendingCheckout(null);
          setError("");
          setSuccessMessage(
            verifyData.confirmationMessage ||
              (isOneTimeMode
                ? "Payment received and your one-time order is confirmed."
                : "Auto-pay is confirmed and your subscription is ready.")
          );
          if (verifyData.subscription && mode === "edit") {
            applySubscriptionState(verifyData.subscription);
          }

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

          setPendingCheckout(null);
          setError(
            isOneTimeMode
              ? "Payment was not completed, so your order is still waiting for confirmation."
              : "Payment setup was not completed, so the subscription is still waiting for confirmation."
          );
          setIsSubmitting(false);
        },
      },
    });

    checkout.open();
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
      {pendingCheckout && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-2xl rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0] p-0 shadow-2xl">
            <div className="border-b border-[#e1d6c7] bg-gradient-to-br from-[#f7f1e6] via-[#f3edde] to-[#eaf1ea] px-6 py-6 md:px-8">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7d74]">
                Before You Continue
              </div>
              <h3 className="mt-3 text-2xl font-semibold text-[#2f4a3e]">
                {isOneTimeMode
                  ? "Confirm your one-time payment"
                  : "This sets up your UPI AutoPay mandate"}
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#53675d]">
                {isOneTimeMode
                  ? "You will be charged now to confirm this order. Once payment succeeds, your delivery is locked in."
                  : "Razorpay may show a small one-time verification amount, often `1` or `5`, to register your mandate. That is not your weekly delivery charge."}
              </p>
            </div>

            <div className="grid gap-4 px-6 py-6 md:grid-cols-3 md:px-8">
              <div className="rounded-2xl border border-[#ddcfb6] bg-[#fffdf8] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7d74]">
                  {isOneTimeMode ? "Charge now" : "Regular charge"}
                </div>
                <div className="mt-2 text-2xl font-semibold text-[#2f4a3e]">
                  {currency} {total.toFixed(2)}
                </div>
                <div className="mt-2 text-sm text-[#53675d]">
                  {isOneTimeMode
                    ? "This is the full one-time amount for this order."
                    : "This is what each scheduled delivery will be charged at."}
                </div>
              </div>
              <div className="rounded-2xl border border-[#ddcfb6] bg-[#fffdf8] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7d74]">
                  {isOneTimeMode ? "Delivery date" : "First charge date"}
                </div>
                <div className="mt-2 text-lg font-semibold text-[#2f4a3e]">
                  {formatSubscriptionDate(effectiveStartDate)}
                </div>
                <div className="mt-2 text-sm text-[#53675d]">
                  {isOneTimeMode
                    ? "We auto-assign the next available delivery date."
                    : "You will not be charged immediately unless you approve the mandate and that date arrives."}
                </div>
              </div>
              <div className="rounded-2xl border border-[#ddcfb6] bg-[#fffdf8] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7d74]">
                  {isOneTimeMode ? "Checkout mode" : "What Razorpay may show now"}
                </div>
                <div className="mt-2 text-lg font-semibold text-[#2f4a3e]">
                  {isOneTimeMode ? "One-time payment" : "Small verification amount"}
                </div>
                <div className="mt-2 text-sm text-[#53675d]">
                  {isOneTimeMode
                    ? `No mandate setup is required. You pay ${currency} ${total.toFixed(2)} now.`
                    : `This temporary amount is only for mandate setup. Your actual subscription amount remains ${currency} ${total.toFixed(2)}.`}
                </div>
              </div>
            </div>

            <div className="px-6 pb-2 md:px-8">
              <div className="rounded-2xl border border-[#d8cdbb] bg-[#fff8ec] p-4 text-sm leading-7 text-[#53675d]">
                {isOneTimeMode
                  ? "Closing checkout without completing payment means your order remains pending."
                  : "Closing the Razorpay window without approving means the mandate is not completed. Your plan will stay pending until you finish the setup."}
              </div>
            </div>

            <div className="modal-action mt-0 flex-row justify-between gap-3 border-t border-[#e1d6c7] px-6 py-5 md:px-8">
              <button
                type="button"
                className="btn btn-ghost text-[#52655b]"
                onClick={() => {
                  setPendingCheckout(null);
                  setIsSubmitting(false);
                }}
              >
                Not now
              </button>
              <button
                type="button"
                className="btn btn-primary min-w-[220px]"
                onClick={async () => {
                  setError("");
                  try {
                    await openRazorpayCheckout();
                  } catch (checkoutError) {
                    setError(checkoutError.message || "Could not open Razorpay checkout.");
                    setIsSubmitting(false);
                  }
                }}
              >
                Continue to Razorpay
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              type="button"
              onClick={() => {
                setPendingCheckout(null);
                setIsSubmitting(false);
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      <section className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7d74]">
              Choose Your Set
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[#53675d]">
              Start with one of our ready-to-go sets, or build your own with the drinks you love.
            </p>
          </div>
          <div className="badge border-[#d1c4b0] bg-[#f7f1e6] text-[#2f5d49]">
            4 to {MAX_TOTAL_QTY} bottles
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
            <div className="text-lg font-semibold text-[#2f4a3e]">Ready-to-go sets</div>
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
            <div className="text-lg font-semibold text-[#2f4a3e]">Build your own set</div>
            <p className="mt-2 text-sm leading-7 text-[#53675d]">
              Mix and match your favourites and choose exactly what goes into each delivery.
            </p>
          </button>
        </div>

        {effectiveSelectionMode === "combo" && comboOptions.length > 0 && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {comboOptions.map((combo) => {
              const comboQty = Math.max(0, Number(comboCart[combo.id] || 0));
              const seasonalIneligibility = (combo.items || []).find((item) => {
                if ((item.skuType || "perennial") !== "seasonal") {
                  return false;
                }

                const cutoffDate = String(item.recurringCutoffDate || "").trim();

                if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
                  return true;
                }

                return recurringPlannedDeliveryDates.some(
                  (deliveryDate) => deliveryDate >= cutoffDate
                );
              });
              const canUseComboInCurrentMode = !(isRecurringMode && seasonalIneligibility);
              const canIncrementCombo =
                !billingLocked &&
                canUseComboInCurrentMode &&
                totalQuantity + Number(combo.totalQuantity || 0) <= MAX_TOTAL_QTY;

              return (
                <article
                  key={combo.id}
                  className={`flex h-full flex-col rounded-2xl border p-5 text-left transition ${
                    comboQty > 0
                      ? "border-[#2f5d49] bg-[#eef4ee] shadow-md"
                      : "border-[#d8cdbb] bg-[#fffaf1]"
                  }`}
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
                  <div className="mt-3 text-xs text-[#5f7068]">
                    {comboQty > 0 ? `${comboQty} set${comboQty === 1 ? "" : "s"} selected` : "Not added yet"}
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-[#456154]">
                    {(combo.items || []).map((item) => (
                      <li key={`${combo.id}-${item.sku}`}>
                        {item.productName} x {item.quantity}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex justify-end pt-4">
                    {comboQty > 0 ? (
                      <div className="inline-flex min-w-[128px] items-center justify-between rounded-lg border border-[#cdbb9e] bg-[#fffaf1] px-2 py-1">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost h-7 min-h-0 px-2"
                          disabled={billingLocked}
                          onClick={() => updateComboQty(combo.id, comboQty - 1)}
                        >
                          -
                        </button>
                        <span className="min-w-[2ch] text-center text-sm font-semibold text-[#2f4a3e]">
                          {comboQty}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost h-7 min-h-0 px-2"
                          disabled={!canIncrementCombo}
                          onClick={() => updateComboQty(combo.id, comboQty + 1)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline min-w-[128px]"
                        disabled={!canIncrementCombo}
                        onClick={() => updateComboQty(combo.id, 1)}
                      >
                        Add to cart
                      </button>
                    )}
                  </div>
                  {!canUseComboInCurrentMode && (
                    <div className="mt-2 text-xs text-[#7a5a2e]">
                      {!seasonalIneligibility?.recurringCutoffDate
                        ? "This set includes seasonal items that are not configured for recurring deliveries yet."
                        : `This set includes seasonal items that must be delivered before ${seasonalIneligibility.recurringCutoffDate}.`}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {selectionMode === "combo" && comboOptions.length === 0 && (
          <div className="mt-6 rounded-2xl border border-[#d8cdbb] bg-[#fffaf1] p-4 text-sm text-[#53675d]">
            We don’t have any ready-to-go sets live right now, so you can build your own below.
          </div>
        )}
      </section>

      {effectiveSelectionMode === "custom" && (
        <section className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6b7d74]">
                Build Your Own Set
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[#53675d]">
                Choose any mix of drinks you like, with at least 4 bottles and up to {MAX_TOTAL_QTY} bottles in each delivery.
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

      {mode === "create" &&
        (canOfferRecurringToggle || recurringNotice || recurringToggleProgress.message) && (
          <section className="rounded-2xl border border-[#d8cdbb] bg-[#fffaf1] p-4 text-sm text-[#53675d]">
            {canOfferRecurringToggle ? (
              <div className="space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={wantsRecurring}
                    onChange={(event) => {
                      setWantsRecurring(event.target.checked);
                      setRecurringNotice("");
                    }}
                  />
                  <span>Want this on repeat? Make it recurring</span>
                </label>
                <div className="text-xs text-[#6b7d74]">
                  Recurring is available only when all selected items can be delivered for the full selected duration.
                </div>
                {recurringToggleProgress.message && (
                  <div className={recurringToggleProgress.tone}>
                    {recurringToggleProgress.message}
                  </div>
                )}
              </div>
            ) : (
              <div>{recurringNotice || recurringToggleProgress.message}</div>
            )}
          </section>
        )}

      <form
        onSubmit={onSubmit}
        className="rounded-[28px] border border-[#d6c6ae] bg-[#fbf7f0]/96 p-6 shadow-xl md:p-8"
      >
        <div className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            {isRecurringMode && (
              <div>
                <div className="label">
                  <span className="label-text text-[#365244]">How Often</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-full border border-[#2f5d49] bg-[#355a45]/85 px-4 py-2 text-sm font-medium text-[#f7f1e6] opacity-70 shadow-md"
                  >
                    {SUBSCRIPTION_CADENCES.find((item) => item.value === LOCKED_SUBSCRIPTION_CADENCE)
                      ?.label || "Weekly"}
                  </button>
                </div>
                <div className="mt-2 text-xs text-[#6b7d74]">
                  Cadence is currently fixed to weekly.
                </div>
              </div>
            )}
            {isRecurringMode && (
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
                <div className="mt-2 text-xs text-[#6b7d74]">
                  Deliveries go out on {formatDeliveryDaysOfWeek(deliveryDaysOfWeek)}.
                </div>
              </div>
            )}
            <div className="md:col-span-2 rounded-2xl border border-[#ddcfb6] bg-[#fffdf8] p-4 text-sm text-[#365244]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-[#2f4a3e]">
                    {selectedStartDateOption
                      ? isOneTimeMode
                        ? `Your delivery date is ${selectedStartDateOption.label}.`
                        : `Your first delivery is set for ${selectedStartDateOption.label}.`
                      : "We don't have a delivery date available in the next 30 days yet."}
                  </div>
                  <div className="mt-1 text-xs text-[#6b7d74]">
                    {isOneTimeMode
                      ? `We currently need at least ${formatMinimumLeadDays(minimumLeadDays)} notice, and deliveries go out on ${formatDeliveryDaysOfWeek(deliveryDaysOfWeek)}.`
                      : `Recurring payment will begin on that date. We currently need at least ${formatMinimumLeadDays(minimumLeadDays)} notice, and deliveries go out on ${formatDeliveryDaysOfWeek(deliveryDaysOfWeek)}.`}
                  </div>
                  {isRecurringMode &&
                    nextDeliveryDate &&
                    nextDeliveryDate !== effectiveStartDate && (
                    <div className="mt-2 text-xs text-[#6b7d74]">
                      After that, your next delivery will be {formatSubscriptionDate(nextDeliveryDate)}.
                    </div>
                  )}
                </div>
                {!isOneTimeMode && !billingLocked && effectiveStartDateOptions.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-[#2f5d49]"
                    onClick={() => setShowStartDateOptions((current) => !current)}
                  >
                    {showStartDateOptions ? "Keep this date" : "Need to start later?"}
                  </button>
                )}
              </div>

              {showStartDateOptions && !billingLocked && effectiveStartDateOptions.length > 0 && (
                <label className="form-control mt-4 max-w-md">
                  <div className="label">
                    <span className="label-text text-[#365244]">Choose a later first delivery</span>
                  </div>
                  <select
                    className="select select-bordered bg-[#fffdf8]"
                    value={effectiveStartDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  >
                    {effectiveStartDateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
                  {isOneTimeMode ? "Your Order" : "Your Plan"}
                </div>
                <p className="mt-2 text-sm leading-7 text-[#53675d]">
                  {effectiveSelectionMode === "combo"
                    ? selectedComboBreakdown.length > 0
                      ? `You have selected ${selectedComboBreakdown.length} ready-to-go set${selectedComboBreakdown.length === 1 ? "" : "s"}.`
                      : "Choose one or more ready-to-go sets to continue."
                    : "You are creating your own set from the current menu."}
                </p>
              </div>
              <div className="badge border-[#d1c4b0] bg-[#f7f1e6] text-[#2f5d49]">
                {totalQuantity} bottle{totalQuantity === 1 ? "" : "s"} selected
              </div>
            </div>

            {selectedItems.length === 0 ? (
              <p className="mt-4 text-sm opacity-70">
                Nothing selected yet. Choose a set or add a few bottles to continue.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {effectiveSelectionMode === "combo" && selectedComboBreakdown.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Set</th>
                          <th>Qty</th>
                          <th className="text-right">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedComboBreakdown.map((combo) => (
                          <tr key={combo.id}>
                            <td>{combo.name}</td>
                            <td>{combo.quantity}</td>
                            <td className="text-right">
                              {currency} {(Number(combo.subtotal || 0) * Number(combo.quantity || 0)).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="overflow-x-auto">
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
              </div>
            )}

            <div className="mt-4 grid gap-2 text-sm text-[#365244]">
              {isRecurringMode && (
                <div className="flex justify-between">
                  <span>How often</span>
                  <span>{SUBSCRIPTION_CADENCES.find((item) => item.value === cadence)?.label || cadence}</span>
                </div>
              )}
              {isRecurringMode && (
                <div className="flex justify-between">
                  <span>How long</span>
                  <span>{formatSubscriptionDuration(durationWeeks)}</span>
                </div>
              )}
              {effectiveStartDate && (
                <div className="flex justify-between gap-4">
                  <span>{isOneTimeMode ? "Delivery date" : "First delivery"}</span>
                  <span className="text-right">{formatSubscriptionDate(effectiveStartDate)}</span>
                </div>
              )}
              {isRecurringMode && effectiveStartDate && (
                <div className="flex justify-between gap-4">
                  <span>First recurring charge</span>
                  <span className="text-right">{formatSubscriptionDate(effectiveStartDate)}</span>
                </div>
              )}
              {isRecurringMode && nextDeliveryDate && nextDeliveryDate !== effectiveStartDate && (
                <div className="flex justify-between gap-4">
                  <span>Next delivery after that</span>
                  <span className="text-right">{formatSubscriptionDate(nextDeliveryDate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{currency} {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>
                  {isRecurringMode
                    ? "Free"
                    : isQuotingDelivery
                    ? "Calculating..."
                    : `${currency} ${Number(deliveryQuote?.deliveryFee || 0).toFixed(2)}`}
                </span>
              </div>
              {isRecurringMode && (
                <div className="text-xs text-[#5f7068]">
                  Recurring plans include free delivery.
                </div>
              )}
              {!isRecurringMode && deliveryQuote?.isFreeDelivery && (
                <div className="text-xs text-[#5f7068]">
                  Delivery is free for this subtotal.
                </div>
              )}
              {!isRecurringMode &&
                !deliveryQuote?.isFreeDelivery &&
                Number.isFinite(Number(freeDeliveryThreshold)) &&
                Number(freeDeliveryThreshold) > 0 && (
                <div className="text-xs text-[#5f7068]">
                  Delivery is free for orders above {currency}{" "}
                  {Number(freeDeliveryThreshold).toFixed(2)}.
                </div>
              )}
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
              {totalQuantity > MAX_TOTAL_QTY && (
                <div className="text-error">Please bring this down to {MAX_TOTAL_QTY} bottles or fewer.</div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span>{isOneTimeMode ? "Total due now" : "Total per delivery"}</span>
                <span>{currency} {total.toFixed(2)}</span>
              </div>
              <div className="text-xs text-[#6b7d74]">
                {isOneTimeMode
                  ? "This is a one-time payment. No UPI AutoPay mandate is required."
                  : "Your UPI AutoPay setup will be authorized at checkout, and the first charge will happen on your first delivery date."}
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
              This plan already has an active recurring payment attached. If you need help making billing changes, email us and we’ll sort it out.
            </div>
          )}

          {isCancelled && (
            <div className="rounded-2xl border border-[#ddcfb6] bg-[#f7f1e6] px-4 py-4 text-sm text-[#52655b]">
              This plan has been cancelled.
            </div>
          )}

          {didEmailChange && (
            <div className="rounded-2xl border border-[#ddcfb6] bg-[#f7f1e6] px-4 py-4 text-sm text-[#52655b]">
              We’ve sent a fresh update link to your new email address.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[#5f7068]">
              {isOneTimeMode
                ? "No login needed. Complete checkout to confirm your one-time order."
                : "No login needed. We’ll email you a secure link so you can update or cancel your plan anytime."}
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
                    : isOneTimeMode
                      ? "Continue to payment"
                      : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

