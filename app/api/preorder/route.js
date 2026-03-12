import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import PreorderWindow from "@/models/PreorderWindow";
import { calculateDeliveryQuote } from "@/libs/delivery";
import { getPlaceDetails } from "@/libs/places";
import { isWindowAcceptingOrders, MAX_PER_ORDER_LIMIT } from "@/libs/preorder-windows";
import { ensureSkuCatalogSeeded, getSkuMap, normalizeAllowedItemRefs } from "@/libs/sku-catalog";

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
    await connectMongo();
    const skuCatalog = await ensureSkuCatalogSeeded();
    const skuMap = getSkuMap(skuCatalog);

    const body = await req.json();

    const customerName = body.customerName?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim();
    const address = body.address?.trim();
    const placeId = body.deliveryPlaceId?.trim() || "";
    const sessionToken = body.addressSessionToken?.trim() || "";
    const customerNotes = body.customerNotes?.trim() || "";
    const preorderWindowId = body.preorderWindowId?.trim() || "";

    const requestItems = sanitizeItems(body.items);

    if (!customerName || !phone || !address) {
      return NextResponse.json(
        { error: "Name, phone number, and address are required" },
        { status: 400 }
      );
    }

    if (requestItems.length === 0) {
      return NextResponse.json(
        {
          error:
            "Add at least one product quantity (SKU + quantity) before placing preorder",
        },
        { status: 400 }
      );
    }

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
        status: total > 0 ? "pending" : "not_required",
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
    });
  } catch (e) {
    console.error(e);

    if (e.message?.startsWith("SKU ")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    if (isDatabaseUnavailable(e.message)) {
      return NextResponse.json(
        {
          error:
            "Preorders are temporarily unavailable because the database connection could not be established. If you are using MongoDB Atlas, add MONGODB_DIRECT_URI with the standard non-SRV connection string.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
