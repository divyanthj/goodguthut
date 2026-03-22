import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import PreorderWindow from "@/models/PreorderWindow";
import { calculateDeliveryQuote } from "@/libs/delivery";
import { getPlaceDetails } from "@/libs/places";
import { isWindowAcceptingOrders, MAX_PER_ORDER_LIMIT } from "@/libs/preorder-windows";
import { getSkuMap, listSkuCatalog, normalizeAllowedItemRefs } from "@/libs/sku-catalog";
import { getRazorpayPublicConfig, isRazorpayConfigured } from "@/libs/razorpay";
import {
  enforceBrowserOrigin,
  isValidAddress,
  isValidEmail,
  isValidName,
  isValidObjectId,
  isValidPhone,
  isValidPlaceId,
  isValidSessionToken,
  jsonError,
  logAbuseEvent,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeSessionToken,
  readJsonBody,
} from "@/libs/request-protection";

const sanitizeItems = (items = []) => {
  return items
    .map((item) => ({
      sku: (item.sku || "").trim().toUpperCase(),
      productName: (item.productName || "").trim(),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }))
    .filter((item) => item.sku && item.productName && item.quantity > 0);
};

const isDatabaseUnavailable = (message = "") => {
  return (
    message.includes("MongoDB SRV lookup failed") ||
    message.includes("buffering timed out") ||
    message.includes("Could not connect to MongoDB")
  );
};

export async function POST(req) {
  try {
    const originError = enforceBrowserOrigin(req);

    if (originError) {
      return originError;
    }

    const body = await readJsonBody(req, { maxBytes: 24 * 1024 });

    const customerName = normalizeName(body.customerName || "");
    const email = normalizeEmail(body.email || "");
    const phone = normalizePhone(body.phone || "");
    const address = normalizeAddress(body.address || "");
    const placeId = body.deliveryPlaceId?.trim() || "";
    const sessionToken = normalizeSessionToken(body.addressSessionToken || "");
    const customerNotes = (body.customerNotes || "").trim().slice(0, 500);
    const preorderWindowId = body.preorderWindowId?.trim() || "";

    const requestItems = sanitizeItems(body.items);

    if (!customerName || !phone || !address) {
      return NextResponse.json(
        { error: "Name, phone number, and address are required" },
        { status: 400 }
      );
    }

    if (!isValidName(customerName)) {
      logAbuseEvent("preorder-invalid-name", req, { nameLength: customerName.length });
      return jsonError("Enter a valid name.", 400);
    }

    if (email && !isValidEmail(email)) {
      logAbuseEvent("preorder-invalid-email", req, { emailLength: email.length });
      return jsonError("Enter a valid email address.", 400);
    }

    if (!isValidPhone(phone)) {
      logAbuseEvent("preorder-invalid-phone", req, { phoneLength: phone.length });
      return jsonError("Enter a valid phone number.", 400);
    }

    if (!isValidAddress(address)) {
      logAbuseEvent("preorder-invalid-address", req, { addressLength: address.length });
      return jsonError("Enter a valid delivery address.", 400);
    }

    if (placeId && !isValidPlaceId(placeId)) {
      logAbuseEvent("preorder-invalid-place-id", req, { placeIdLength: placeId.length });
      return jsonError("Invalid delivery placeId.", 400);
    }

    if (!isValidSessionToken(sessionToken)) {
      logAbuseEvent("preorder-invalid-session-token", req);
      return jsonError("Invalid delivery lookup session.", 400);
    }

    if (preorderWindowId && !isValidObjectId(preorderWindowId)) {
      logAbuseEvent("preorder-invalid-window-id", req);
      return jsonError("Invalid preorder window.", 400);
    }

    if (requestItems.length === 0) {
      logAbuseEvent("preorder-empty-items", req);
      return NextResponse.json(
        {
          error:
            "Add at least one product quantity (SKU + quantity) before placing preorder",
        },
        { status: 400 }
      );
    }

    if (requestItems.length > 12) {
      logAbuseEvent("preorder-too-many-items", req, { itemCount: requestItems.length });
      return jsonError("Too many distinct products in one preorder.", 400);
    }

    await connectMongo();
    const skuCatalog = await listSkuCatalog();
    const skuMap = getSkuMap(skuCatalog);

    let preorderWindow = null;
    if (preorderWindowId) {
      preorderWindow = await PreorderWindow.findById(preorderWindowId);
      if (!preorderWindow) {
        return NextResponse.json(
          { error: "Selected preorder window was not found" },
          { status: 400 }
        );
      }

      if (!isWindowAcceptingOrders(preorderWindow)) {
        return NextResponse.json(
          { error: "Preorders are closed for the selected delivery window" },
          { status: 400 }
        );
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
        throw new Error(
          `SKU ${item.sku} maximum quantity per preorder is ${MAX_PER_ORDER_LIMIT}`
        );
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
      return NextResponse.json(
        {
          error: `Minimum preorder quantity is ${minimumOrderQuantity}.`,
        },
        { status: 400 }
      );
    }

    let deliveryFee = 0;
    let deliveryDistanceKm = 0;
    let normalizedDeliveryAddress = address;

    if (preorderWindow?.pickupAddress && preorderWindow?.deliveryBands?.length) {
      if (!placeId) {
        return NextResponse.json(
          { error: "Please select a delivery address from the suggestions." },
          { status: 400 }
        );
      }

      const placeDetails = await getPlaceDetails({ placeId, sessionToken });
      const deliveryQuote = await calculateDeliveryQuote({
        pickupAddress: preorderWindow.pickupAddress,
        deliveryBands: preorderWindow.deliveryBands,
        address,
        placeDetails,
      });

      if (!deliveryQuote.isDeliverable) {
        return NextResponse.json(
          { error: deliveryQuote.reason || "We do not deliver there yet." },
          { status: 400 }
        );
      }

      deliveryFee = deliveryQuote.deliveryFee;
      deliveryDistanceKm = deliveryQuote.distanceKm;
      normalizedDeliveryAddress = deliveryQuote.normalizedAddress;
    }

    const total = subtotal + deliveryFee;

    const preorder = await Preorder.create({
      customerName,
      email: email || "",
      phone,
      address,
      normalizedDeliveryAddress,
      customerNotes,
      preorderWindow: preorderWindow?._id || null,
      preorderWindowLabel: preorderWindow?.title || "",
      deliveryDate: preorderWindow?.deliveryDate || null,
      currency: preorderWindow?.currency || "INR",
      items,
      totalQuantity,
      subtotal,
      deliveryFee,
      deliveryDistanceKm,
      total,
      source: "landing",
      payment: {
        provider: isRazorpayConfigured() ? "razorpay" : "",
        status: isRazorpayConfigured() ? "pending" : "not_required",
        amount: total,
        currency: preorderWindow?.currency || "INR",
      },
    });

    return NextResponse.json({
      id: preorder.id,
      status: preorder.status,
      totalQuantity: preorder.totalQuantity,
      subtotal: preorder.subtotal,
      deliveryFee: preorder.deliveryFee,
      deliveryDistanceKm: preorder.deliveryDistanceKm,
      total: preorder.total,
      currency: preorder.currency,
      paymentStatus: preorder.payment?.status,
      razorpay: getRazorpayPublicConfig(),
      confirmationMessage: isRazorpayConfigured()
        ? "Preorder received. Complete payment to confirm this order automatically."
        : "Preorder received. We will contact you on WhatsApp or by text to confirm your order before payment.",
    });
  } catch (e) {
    console.error(e);

    if (e.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("preorder-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    if (e.message === "INVALID_JSON") {
      logAbuseEvent("preorder-invalid-json", req);
      return jsonError("Request body must be valid JSON.", 400);
    }

    if (e.message?.startsWith("SKU ")) {
      logAbuseEvent("preorder-invalid-sku", req, { message: e.message });
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    if (isDatabaseUnavailable(e.message)) {
      logAbuseEvent("preorder-database-unavailable", req, { message: e.message });
      return NextResponse.json(
        {
          error:
            "Preorders are temporarily unavailable because the database connection could not be established. If you are using MongoDB Atlas, add MONGODB_DIRECT_URI with the standard non-SRV connection string.",
        },
        { status: 503 }
      );
    }

    logAbuseEvent("preorder-server-error", req, { message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
