import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { calculateDeliveryQuote } from "@/libs/delivery";
import { resolveDiscountCode, normalizeDiscountCode } from "@/libs/discount-codes";
import { getPlaceDetails } from "@/libs/places";
import {
  formatPickupAddress,
  MAX_PER_ORDER_LIMIT,
} from "@/libs/preorder-windows";
import { getSkuMap, listSkuCatalog, normalizeAllowedItemRefs } from "@/libs/sku-catalog";
import {
  isValidAddress,
  isValidEmail,
  isValidName,
  isValidObjectId,
  isValidPhone,
  isValidPlaceId,
  isValidSessionToken,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSessionToken,
} from "@/libs/request-protection";

export const sanitizePreorderItems = (items = []) => {
  return items
    .map((item) => ({
      sku: (item.sku || "").trim().toUpperCase(),
      productName: (item.productName || "").trim(),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }))
    .filter((item) => item.sku && item.productName && item.quantity > 0);
};

export const buildPreorderRequest = async (body = {}) => {
  const customerName = normalizeName(body.customerName || "");
  const email = normalizeEmail(body.email || "");
  const phone = normalizePhone(body.phone || "");
  const address = normalizeAddress(body.address || "");
  const placeId = body.deliveryPlaceId?.trim() || "";
  const sessionToken = normalizeSessionToken(body.addressSessionToken || "");
  const isPickup = body.isPickup === true;
  const customerNotes = (body.customerNotes || "").trim().slice(0, 500);
  const preorderWindowId = body.preorderWindowId?.trim() || "";
  const discountCodeInput = normalizeDiscountCode(body.discountCode || "");
  const requestItems = sanitizePreorderItems(body.items);

  if (!customerName || !phone || (!isPickup && !address)) {
    throw new Error(
      isPickup
        ? "Name and phone number are required for pickup."
        : "Name, phone number, and address are required"
    );
  }

  if (!isValidName(customerName)) {
    throw new Error("Enter a valid name.");
  }

  if (email && !isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!isValidPhone(phone)) {
    throw new Error("Enter a valid phone number.");
  }

  if (!isPickup && !isValidAddress(address)) {
    throw new Error("Enter a valid delivery address.");
  }

  if (!isPickup && placeId && !isValidPlaceId(placeId)) {
    throw new Error("Invalid delivery placeId.");
  }

  if (!isValidSessionToken(sessionToken)) {
    throw new Error("Invalid delivery lookup session.");
  }

  if (preorderWindowId && !isValidObjectId(preorderWindowId)) {
    throw new Error("Invalid preorder window.");
  }

  if (requestItems.length === 0) {
    throw new Error("Add at least one product quantity (SKU + quantity) before placing preorder");
  }

  if (requestItems.length > 12) {
    throw new Error("Too many distinct products in one preorder.");
  }

  await connectMongo();
  const skuCatalog = await listSkuCatalog();
  const skuMap = getSkuMap(skuCatalog);

  let preorderWindow = null;
  if (preorderWindowId) {
    preorderWindow = await PreorderWindow.findById(preorderWindowId);
    if (!preorderWindow) {
      throw new Error("Selected preorder window was not found");
    }

    if (isPickup && !preorderWindow.allowFreePickup) {
      throw new Error("Pickup is not enabled for this preorder batch.");
    }
  }

  const allowedItemsBySku = preorderWindow
    ? new Map(
        normalizeAllowedItemRefs(preorderWindow.allowedItems).map((item) => [item.sku, skuMap.get(item.sku)])
      )
    : null;

  const items = requestItems.map((item) => {
    const allowedItem = allowedItemsBySku?.get(item.sku);
    const catalogItem = skuMap.get(item.sku);

    if (preorderWindow && !allowedItem) {
      throw new Error(`SKU ${item.sku} is not available in this preorder window`);
    }

    if (!catalogItem || catalogItem.status !== "active") {
      throw new Error(`SKU ${item.sku} is not currently available`);
    }

    if (item.quantity > MAX_PER_ORDER_LIMIT) {
      throw new Error(`SKU ${item.sku} maximum quantity per preorder is ${MAX_PER_ORDER_LIMIT}`);
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

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const minimumOrderQuantity = Math.max(1, Number(preorderWindow?.minimumOrderQuantity || 1));

  if (totalQuantity < minimumOrderQuantity) {
    throw new Error(`Minimum preorder quantity is ${minimumOrderQuantity}.`);
  }

  const { discount } = await resolveDiscountCode({
    code: discountCodeInput,
    subtotal,
  });

  let deliveryFee = 0;
  let deliveryDistanceKm = 0;
  let normalizedDeliveryAddress = address;
  const pickupAddressSnapshot = formatPickupAddress({
    pickupDoorNumber: preorderWindow?.pickupDoorNumber,
    pickupAddress: preorderWindow?.pickupAddress,
  });

  if (isPickup) {
    normalizedDeliveryAddress = "";
  } else if (preorderWindow?.pickupAddress && preorderWindow?.deliveryBands?.length) {
    if (!placeId) {
      throw new Error("Please select a delivery address from the suggestions.");
    }

    const placeDetails = await getPlaceDetails({ placeId, sessionToken });
    const deliveryQuote = await calculateDeliveryQuote({
      pickupAddress: pickupAddressSnapshot || preorderWindow.pickupAddress,
      deliveryBands: preorderWindow.deliveryBands,
      address,
      placeDetails,
      orderSubtotal: subtotal,
      freeDeliveryThreshold: preorderWindow.freeDeliveryThreshold,
    });

    if (!deliveryQuote.isDeliverable) {
      throw new Error(deliveryQuote.reason || "We do not deliver there yet.");
    }

    deliveryFee = deliveryQuote.deliveryFee;
    deliveryDistanceKm = deliveryQuote.distanceKm;
    normalizedDeliveryAddress = deliveryQuote.normalizedAddress;
  }

  const total = discount.subtotalAfterDiscount + deliveryFee;

  return {
    customerName,
    email: email || "",
    phone,
    address,
    normalizedDeliveryAddress,
    fulfillmentMethod: isPickup ? "pickup" : "delivery",
    pickupAddressSnapshot,
    pickupDoorNumber: preorderWindow?.pickupDoorNumber || "",
    customerNotes,
    preorderWindowId,
    preorderWindow: preorderWindow
      ? {
          id: preorderWindow.id,
          title: preorderWindow.title || "",
          deliveryDate: preorderWindow.deliveryDate || null,
          currency: preorderWindow.currency || "INR",
          allowFreePickup: preorderWindow.allowFreePickup === true,
          pickupAddress: preorderWindow.pickupAddress || "",
          pickupDoorNumber: preorderWindow.pickupDoorNumber || "",
          freeDeliveryThreshold: preorderWindow.freeDeliveryThreshold ?? null,
        }
      : null,
    items,
    totalQuantity,
    subtotal,
    discount,
    deliveryFee,
    deliveryDistanceKm,
    total,
    currency: preorderWindow?.currency || "INR",
  };
};
