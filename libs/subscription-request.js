import connectMongo from "@/libs/mongoose";
import { calculateDeliveryQuote } from "@/libs/delivery";
import { getPlaceDetails } from "@/libs/places";
import { getActiveWindowFilter, MAX_PER_ORDER_LIMIT } from "@/libs/preorder-windows";
import { getSkuMap, listSkuCatalog } from "@/libs/sku-catalog";
import { hydrateSubscriptionCombo, listSubscriptionCombos } from "@/libs/subscription-combos";
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
  const [skuCatalog, comboDocs] = await Promise.all([
    listSkuCatalog(),
    listSubscriptionCombos({ includeArchived: false }),
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
  const serializedSkuCatalog = JSON.parse(JSON.stringify(skuCatalog));
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
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  if (totalQuantity < 4) {
    throw new Error("Subscriptions must include at least 4 bottles.");
  }

  if (totalQuantity > 10) {
    throw new Error("Subscriptions cannot include more than 10 bottles.");
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
    });

    if (!deliveryQuote.isDeliverable) {
      throw new Error(deliveryQuote.reason || "We do not deliver there yet.");
    }

    deliveryFee = deliveryQuote.deliveryFee;
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
