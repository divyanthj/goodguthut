import { calculateDeliveryQuote } from "@/libs/delivery";
import { getPlaceDetails } from "@/libs/places";
import { MAX_PER_ORDER_LIMIT } from "@/libs/preorder-windows";
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
import {
  buildSubscriptionRequest,
  getSubscriptionSetupContext,
  sanitizeSubscriptionItems,
} from "@/libs/subscription-request";
import { getSkuMap } from "@/libs/sku-catalog";
import { getDefaultSubscriptionStartDate } from "@/libs/subscription-schedule";
import { MAX_TOTAL_QTY, ONE_TIME_MIN_TOTAL_QTY } from "@/libs/order-quantity";
import { verifySignedRecurringRolloutToken } from "@/libs/subscription-rollout";

const buildOneTimeRequest = async (body = {}) => {
  const name = normalizeName(body.name || "");
  const email = normalizeEmail(body.email || "");
  const phone = normalizePhone(body.phone || "");
  const address = normalizeAddress(body.address || "");
  const placeId = (body.deliveryPlaceId || "").trim();
  const sessionToken = normalizeSessionToken(body.addressSessionToken || "");
  const selectionMode = body.selectionMode === "combo" ? "combo" : "custom";
  const comboId = String(body.comboId || "").trim();
  const requestItems = sanitizeSubscriptionItems(body.items);

  if (!name || !isValidName(name)) {
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

  if (placeId && !isValidPlaceId(placeId)) {
    throw new Error("Invalid delivery placeId.");
  }

  if (!isValidSessionToken(sessionToken)) {
    throw new Error("Invalid delivery lookup session.");
  }

  if (selectionMode === "custom" && requestItems.length === 0) {
    throw new Error("Add at least one product quantity (SKU + quantity) before placing your order.");
  }

  if (requestItems.length > 12) {
    throw new Error("Too many distinct products in one order.");
  }

  const {
    skuCatalog,
    comboCatalog,
    pickupAddress,
    deliveryBands,
    deliveryDaysOfWeek,
    minimumLeadDays,
    currency,
  } = await getSubscriptionSetupContext();
  const skuMap = getSkuMap(skuCatalog);
  const selectedCombo =
    selectionMode === "combo" ? comboCatalog.find((combo) => combo.id === comboId) : null;

  if (selectionMode === "combo" && !selectedCombo) {
    throw new Error("Select one of the available boxes.");
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
      throw new Error(`SKU ${item.sku} maximum quantity per order is ${MAX_PER_ORDER_LIMIT}`);
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

  if (totalQuantity < ONE_TIME_MIN_TOTAL_QTY) {
    throw new Error(`Orders must include at least ${ONE_TIME_MIN_TOTAL_QTY} bottles.`);
  }

  if (totalQuantity > MAX_TOTAL_QTY) {
    throw new Error(`Orders cannot include more than ${MAX_TOTAL_QTY} bottles.`);
  }

  if (deliveryDaysOfWeek.length === 0) {
    throw new Error("Orders are not available until delivery days are configured.");
  }

  const startDate = getDefaultSubscriptionStartDate({
    deliveryDaysOfWeek,
    minimumLeadDays,
  });

  if (!startDate) {
    throw new Error("There are no delivery dates available in the next 30 days.");
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
    });

    if (!deliveryQuote.isDeliverable) {
      throw new Error(deliveryQuote.reason || "We do not deliver there yet.");
    }

    deliveryFee = deliveryQuote.deliveryFee;
    deliveryDistanceKm = deliveryQuote.distanceKm;
    normalizedDeliveryAddress = deliveryQuote.normalizedAddress;
  }

  return {
    mode: "one_time",
    paymentType: "one_time",
    name,
    email,
    phone,
    address,
    normalizedDeliveryAddress,
    cadence: "",
    durationWeeks: 0,
    selectionMode,
    comboId: selectedCombo?.id || "",
    comboName: selectedCombo?.name || "",
    deliveryDaysOfWeek,
    minimumLeadDays,
    startDate,
    firstDeliveryDate: startDate,
    nextDeliveryDate: startDate,
    currency,
    items,
    totalQuantity,
    subtotal,
    deliveryFee,
    deliveryDistanceKm,
    total: subtotal + deliveryFee,
    addressSessionToken: sessionToken,
    deliveryPlaceId: placeId,
  };
};

export const buildOrderPlanRequest = async (body = {}) => {
  const mode = String(body.mode || "one_time").trim().toLowerCase();

  if (mode === "recurring") {
    const recurringAccess = verifySignedRecurringRolloutToken(
      String(body.rolloutAccessToken || "").trim()
    );

    if (!recurringAccess.isValid) {
      throw new Error("Recurring subscription access is not enabled for this link.");
    }

    const recurringRequest = await buildSubscriptionRequest(body);
    return {
      ...recurringRequest,
      mode: "recurring",
      paymentType: "recurring",
    };
  }

  if (mode !== "one_time") {
    throw new Error("Select a valid order mode.");
  }

  return buildOneTimeRequest(body);
};
