import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { createDefaultAllowedItems, createDefaultPreorderWindow } from "@/libs/preorder-catalog";

const sanitizeAllowedItems = (items = []) => {
  const fallbackItems = createDefaultAllowedItems();
  const fallbackMap = new Map(fallbackItems.map((item) => [item.sku, item]));
  const seenSkus = new Set();

  return items
    .map((item) => {
      const sku = (item.sku || "").trim().toUpperCase();
      const fallback = fallbackMap.get(sku);

      return {
        sku,
        productName: (item.productName || fallback?.productName || "").trim(),
        unitPrice: Math.max(0, Number(item.unitPrice || 0)),
        isActive: item.isActive !== false,
        maxPerOrder: Math.min(10, Math.max(1, Number(item.maxPerOrder || 10))),
        notes: (item.notes || fallback?.notes || "").trim(),
      };
    })
    .filter((item) => item.sku && item.productName)
    .filter((item) => {
      if (seenSkus.has(item.sku)) {
        return false;
      }

      seenSkus.add(item.sku);
      return true;
    });
};

const sanitizeDeliveryBands = (bands = []) => {
  return bands
    .map((band) => {
      const minDistanceKm = Math.max(0, Number(band.minDistanceKm ?? 0));
      const maxDistanceKm = Math.max(minDistanceKm, Number(band.maxDistanceKm ?? minDistanceKm));
      const fee = Math.max(0, Number(band.fee ?? 0));

      return {
        minDistanceKm,
        maxDistanceKm,
        fee,
      };
    })
    .filter((band) => band.maxDistanceKm > band.minDistanceKm)
    .sort((a, b) => a.minDistanceKm - b.minDistanceKm);
};

const getAdminSession = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
};

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  const preorderWindow = await PreorderWindow.findOne({
    status: { $in: ["draft", "open", "closed"] },
  }).sort({ updatedAt: -1, createdAt: -1 });

  return NextResponse.json({
    preorderWindow: preorderWindow || createDefaultPreorderWindow(),
  });
}

export async function PUT(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const body = await req.json();
    const allowedItems = sanitizeAllowedItems(body.allowedItems);
    const deliveryBands = sanitizeDeliveryBands(body.deliveryBands);

    if (allowedItems.length === 0) {
      return NextResponse.json(
        { error: "Add at least one SKU before saving." },
        { status: 400 }
      );
    }

    const payload = {
      title: "Current preorder window",
      status: body.isOpen ? "open" : "closed",
      deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : new Date(),
      currency: "INR",
      minimumOrderQuantity: Math.max(1, Number(body.minimumOrderQuantity || 1)),
      pickupAddress: (body.pickupAddress || "").trim(),
      deliveryBands,
      allowCustomerNotes: true,
      allowedItems,
    };

    let preorderWindow;

    if (body.id) {
      preorderWindow = await PreorderWindow.findByIdAndUpdate(body.id, payload, {
        new: true,
        runValidators: true,
      });
    }

    if (!preorderWindow) {
      preorderWindow = await PreorderWindow.create(payload);
    }

    return NextResponse.json({ preorderWindow });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
