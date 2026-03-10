import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import PreorderWindow from "@/models/PreorderWindow";

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

export async function POST(req) {
  try {
    await connectMongo();

    const body = await req.json();

    const customerName = body.customerName?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim();
    const address = body.address?.trim();
    const customerNotes = body.customerNotes?.trim() || "";
    const preorderWindowId = body.preorderWindowId?.trim() || "";

    const requestItems = sanitizeItems(body.items);

    if (!customerName || !email || !phone || !address) {
      return NextResponse.json(
        { error: "Name, email, phone number, and address are required" },
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

      if (preorderWindow.status !== "open") {
        return NextResponse.json(
          { error: "Preorders are closed for the selected delivery window" },
          { status: 400 }
        );
      }
    }

    const allowedItemsBySku = preorderWindow
      ? new Map(
          preorderWindow.allowedItems
            .filter((item) => item.isActive)
            .map((item) => [item.sku, item])
        )
      : null;

    const items = requestItems.map((item) => {
      const allowedItem = allowedItemsBySku?.get(item.sku);

      if (preorderWindow && !allowedItem) {
        throw new Error(`SKU ${item.sku} is not available in this preorder window`);
      }

      if (item.quantity > 10) {
        throw new Error(`SKU ${item.sku} maximum quantity per preorder is 10`);
      }

      if (allowedItem?.maxPerOrder && item.quantity > allowedItem.maxPerOrder) {
        throw new Error(
          `SKU ${item.sku} maximum quantity per preorder is ${allowedItem.maxPerOrder}`
        );
      }

      const unitPrice = Math.max(0, Number(allowedItem?.unitPrice ?? item.unitPrice ?? 0));

      return {
        sku: item.sku,
        productName: allowedItem?.productName || item.productName,
        quantity: item.quantity,
        unitPrice,
        lineTotal: item.quantity * unitPrice,
      };
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    const preorder = await Preorder.create({
      customerName,
      email,
      phone,
      address,
      customerNotes,
      preorderWindow: preorderWindow?._id || null,
      preorderWindowLabel: preorderWindow?.title || "",
      deliveryDate: preorderWindow?.deliveryDate || null,
      currency: preorderWindow?.currency || "INR",
      items,
      totalQuantity,
      subtotal,
      source: "landing",
    });

    return NextResponse.json({
      id: preorder.id,
      status: preorder.status,
      totalQuantity: preorder.totalQuantity,
      subtotal: preorder.subtotal,
      currency: preorder.currency,
    });
  } catch (e) {
    console.error(e);

    if (e.message?.startsWith("SKU ")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
