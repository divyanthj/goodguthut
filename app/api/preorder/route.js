import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";

const sanitizeItems = (items = []) => {
  return items
    .map((item) => ({
      sku: (item.sku || "").trim().toUpperCase(),
      productName: (item.productName || "").trim(),
      quantity: Number(item.quantity || 0),
      quantityNotes: (item.quantityNotes || "").trim(),
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
    const items = sanitizeItems(body.items);

    if (!customerName || !email || !phone || !address) {
      return NextResponse.json(
        { error: "Name, email, phone number, and address are required" },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            "Add at least one product quantity (SKU + quantity) before placing preorder",
        },
        { status: 400 }
      );
    }

    const preorder = await Preorder.create({
      customerName,
      email,
      phone,
      address,
      items,
    });

    return NextResponse.json({ id: preorder.id, status: preorder.status });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
