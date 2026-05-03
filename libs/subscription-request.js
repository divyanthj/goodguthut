import connectMongo from "@/libs/mongoose";
import { calculateDeliveryQuote } from "@/libs/delivery";
import { getPlaceDetails } from "@/libs/places";
import { getActiveWindowFilter, MAX_PER_ORDER_LIMIT } from "@/libs/preorder-windows";
import { getSkuMap, listSkuCatalog } from "@/libs/sku-catalog";
import { hydrateSubscriptionCombo, listSubscriptionCombos } from "@/libs/subscription-combos";
import {
  getSubscriptionSettings,
  sanitizeDeliveryDaysOfWeek,
  sanitizeMinimumLeadDays,
  sanitizeRecurringMinTotalQuantity,
} from "@/libs/subscription-settings";
import { MAX_TOTAL_QTY } from "@/libs/order-quantity";
import PreorderWindow from "@/models/PreorderWindow";
import {
  isValidAddress,
  isValidEmail,
  isValidName,
  isValidPhone,
  isValidPlaceId,
  isValidSessionToken,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSessionToken,
} from "@/libs/request-protection";
import { getSubscriptionDurationConfig } from "@/libs/subscriptions";
import {
  getDefaultSubscriptionStartDate,
  getNextSubscriptionDeliveryDate,
  isValidSubscriptionStartDate,
  listPlannedSubscriptionDeliveryDates,
  listAvailableSubscriptionStartDates,
} from "@/libs/subscription-schedule";
import {
  buildSeasonalCutoffMapFromCatalog,
  getSeasonalCoverageError,
} from "@/libs/recurring-seasonal-policy";

export const sanitizeSubscriptionItems = (items = []) =>
  items
    .map((item) => ({
      sku: (item.sku || "").trim().toUpperCase(),
      productName: (item.productName || "").trim(),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }))
    .filter((item) => item.sku && item.quantity > 0);

export const getSubscriptionSetupContext = async () => {
  await connectMongo();
  const [skuCatalog, comboDocs, subscriptionSettings] = await Promise.all([
    listSkuCatalog(),
    listSubscriptionCombos({ includeArchived: false }),
    getSubscriptionSettings(),
  ]);
  const skuMap = getSkuMap(skuCatalog);
  const activeWindow = await PreorderWindow.findOne(getActiveWindowFilter()).sort({
    opensAt: -1,
    updatedAt: -1,
    createdAt: -1,
  });
  const fallbackWindow = activeWindow
    ? null
    : await PreorderWindow.findOne({
        pickupAddress: { $ne: "" },
        "deliveryBands.0": { $exists: true },
      }).sort({
        status: 1,
        updatedAt: -1,
        createdAt: -1,
      });
  const deliveryWindow = activeWindow || fallbackWindow;
  const customOrderCatalog = skuCatalog.filter(
    (item) => item?.sku && item.status !== "archived"
  );
  const serializedSkuCatalog = JSON.parse(JSON.stringify(customOrderCatalog));
  const serializedDeliveryWindow = deliveryWindow
    ? JSON.parse(JSON.stringify(deliveryWindow))
    : null;
  const comboCatalog = comboDocs
    .map((combo) => hydrateSubscriptionCombo(combo, skuMap))
    .filter((combo) => combo?.status === "active");

  return {
    skuCatalog: serializedSkuCatalog,
    comboCatalog,
    deliveryWindow: serializedDeliveryWindow,
    deliveryWindowId: serializedDeliveryWindow?.id || "",
    pickupAddress: serializedDeliveryWindow?.pickupAddress || "",
    deliveryBands: serializedDeliveryWindow?.deliveryBands || [],
    freeDeliveryThreshold: serializedDeliveryWindow?.freeDeliveryThreshold ?? null,
    deliveryDaysOfWeek: sanitizeDeliveryDaysOfWeek(subscriptionSettings?.deliveryDaysOfWeek),
    minimumLeadDays: sanitizeMinimumLeadDays(subscriptionSettings?.minimumLeadDays),
    recurringMinTotalQuantity: sanitizeRecurringMinTotalQuantity(
      subscriptionSettings?.recurringMinTotalQuantity
    ),
    availableStartDates: listAvailableSubscriptionStartDates({
      deliveryDaysOfWeek: sanitizeDeliveryDaysOfWeek(subscriptionSettings?.deliveryDaysOfWeek),
      minimumLeadDays: sanitizeMinimumLeadDays(subscriptionSettings?.minimumLeadDays),
    }),
    defaultStartDate: getDefaultSubscriptionStartDate({
      deliveryDaysOfWeek: sanitizeDeliveryDaysOfWeek(subscriptionSettings?.deliveryDaysOfWeek),
      minimumLeadDays: sanitizeMinimumLeadDays(subscriptionSettings?.minimumLeadDays),
    }),
    currency: serializedDeliveryWindow?.currency || "INR",
  };
};

export const buildSubscriptionRequest = async (body = {}) => {
  const name = normalizeName(body.name || "");
  const email = normalizeEmail(body.email || "");
  const phone = normalizePhone(body.phone || "");
  const address = normalizeAddress(body.address || "");
  const placeId = (body.deliveryPlaceId || "").trim();
  const sessionToken = normalizeSessionToken(body.addressSessionToken || "");
  const cadence = String(body.cadence || "").trim().toLowerCase();
  const durationWeeks = Number(body.durationWeeks || 0);
  const requestedStartDate = String(body.startDate || "").trim();
  const selectionMode = body.selectionMode === "combo" ? "combo" : "custom";
  const comboId = String(body.comboId || "").trim();
  const requestItems = sanitizeSubscriptionItems(body.items);

  if (!name) {
    throw new Error("Enter a valid name.");
  }

  if (!isValidName(name)) {
    throw new Error("Enter a valid name.");
  }

  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!isValidPhone(phone)) {
    throw new Error("Enter a valid phone number.");
  }

  if (!isValidAddress(address)) {
    throw new Error("Enter a valid delivery address.");
  }

  if (!["weekly", "fortnightly", "monthly"].includes(cadence)) {
    throw new Error("Select a valid subscription cadence.");
  }

  const durationConfig = getSubscriptionDurationConfig(cadence, durationWeeks);

  if (placeId && !isValidPlaceId(placeId)) {
    throw new Error("Invalid delivery placeId.");
  }

  if (!isValidSessionToken(sessionToken)) {
    throw new Error("Invalid delivery lookup session.");
  }

  if (selectionMode === "custom" && requestItems.length === 0) {
    throw new Error("Add at least one product quantity (SKU + quantity) before starting a subscription.");
  }

  if (requestItems.length > 12) {
    throw new Error("Too many distinct products in one subscription.");
  }

  const {
    skuCatalog,
    comboCatalog,
    pickupAddress,
    deliveryBands,
    freeDeliveryThreshold,
    deliveryDaysOfWeek,
    minimumLeadDays,
    recurringMinTotalQuantity,
    currency,
  } = await getSubscriptionSetupContext();
  const skuMap = getSkuMap(skuCatalog);
  const selectedCombo =
    selectionMode === "combo" ? comboCatalog.find((combo) => combo.id === comboId) : null;

  if (selectionMode === "combo" && !selectedCombo) {
    throw new Error("Select one of the available subscription combos.");
  }

  const sourceItems =
    selectionMode === "combo"
      ? (selectedCombo?.items || []).map((item) => ({
          sku: item.sku,
          productName: item.productName,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
        }))
      : requestItems;

  const items = sourceItems.map((item) => {
    const catalogItem = skuMap.get(item.sku);

    if (!catalogItem || catalogItem.status !== "active") {
      throw new Error(`SKU ${item.sku} is not currently available`);
    }

    if (item.quantity > MAX_PER_ORDER_LIMIT) {
      throw new Error(`SKU ${item.sku} maximum quantity per subscription is ${MAX_PER_ORDER_LIMIT}`);
    }

    const unitPrice = Math.max(0, Number(catalogItem.unitPrice ?? item.unitPrice ?? 0));

    return {
      sku: item.sku,
      productName: catalogItem.name || item.productName,
      quantity: item.quantity,
      unitPrice,
      lineTotal: item.quantity * unitPrice,
      skuType: catalogItem.skuType || "perennial",
      recurringCutoffDate: String(catalogItem.recurringCutoffDate || "").trim(),
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  if (totalQuantity < recurringMinTotalQuantity) {
    throw new Error(
      `Subscriptions must include at least ${recurringMinTotalQuantity} bottles.`
    );
  }

  if (totalQuantity > MAX_TOTAL_QTY) {
    throw new Error(`Subscriptions cannot include more than ${MAX_TOTAL_QTY} bottles.`);
  }

  if (deliveryDaysOfWeek.length === 0) {
    throw new Error("Subscriptions are not available until delivery days are configured.");
  }

  const startDate =
    requestedStartDate ||
    getDefaultSubscriptionStartDate({
      deliveryDaysOfWeek,
      minimumLeadDays,
    });

  if (!startDate) {
    throw new Error("There are no delivery dates available in the next 30 days.");
  }

  if (
    !isValidSubscriptionStartDate({
      startDate,
      deliveryDaysOfWeek,
      minimumLeadDays,
    })
  ) {
    throw new Error("Choose a valid first delivery date within the next 30 days.");
  }

  const plannedDeliveryDates = listPlannedSubscriptionDeliveryDates({
    startDate,
    cadence,
    totalCount: durationConfig.totalCount,
  });

  const seasonalCoverageError = getSeasonalCoverageError({
    items,
    plannedDeliveryDates,
    seasonalCutoffBySku: buildSeasonalCutoffMapFromCatalog(skuCatalog),
  });

  if (seasonalCoverageError) {
    throw new Error(seasonalCoverageError);
  }

  let deliveryFee = 0;
  let deliveryDistanceKm = 0;
  let normalizedDeliveryAddress = address;

  if (pickupAddress && deliveryBands.length > 0) {
    if (!placeId) {
      throw new Error("Please select a delivery address from the suggestions.");
    }

    const placeDetails = await getPlaceDetails({ placeId, sessionToken });
    const deliveryQuote = await calculateDeliveryQuote({
      pickupAddress,
      deliveryBands,
      address,
      placeDetails,
      orderSubtotal: subtotal,
      freeDeliveryThreshold,
    });

    if (!deliveryQuote.isDeliverable) {
      throw new Error(deliveryQuote.reason || "We do not deliver there yet.");
    }

    // Recurring plans now always ship free; keep quote only for deliverability checks.
    deliveryFee = 0;
    deliveryDistanceKm = deliveryQuote.distanceKm;
    normalizedDeliveryAddress = deliveryQuote.normalizedAddress;
  }

  return {
    name,
    email,
    phone,
    address,
    normalizedDeliveryAddress,
    cadence,
    durationWeeks: durationConfig.durationWeeks,
    currency,
    items,
    selectionMode,
    comboId: selectedCombo?.id || "",
    comboName: selectedCombo?.name || "",
    deliveryDaysOfWeek,
    minimumLeadDays,
    recurringMinTotalQuantity,
    startDate,
    firstDeliveryDate: startDate,
    nextDeliveryDate: getNextSubscriptionDeliveryDate({
      startDate,
      cadence,
      paidCount: 0,
      totalCount: durationConfig.totalCount,
    }),
    totalQuantity,
    subtotal,
    deliveryFee,
    deliveryDistanceKm,
    total: subtotal + deliveryFee,
    pickupAddress,
    deliveryBands,
    addressSessionToken: sessionToken,
    deliveryPlaceId: placeId,
    skuCatalog,
  };
};
