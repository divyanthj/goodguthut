import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { createAndSendRouteDeliveryInvoice } from "@/libs/invoices";

export async function POST(req) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const sourceType = String(body?.sourceType || "").trim();
    const sourceId = String(body?.sourceId || "").trim();
    const deliveryDate = String(body?.deliveryDate || "").trim();
    const deliveredAtValue = String(body?.deliveredAt || "").trim();
    const deliveredAt = deliveredAtValue ? new Date(deliveredAtValue) : new Date();

    if (!["subscription", "order_plan"].includes(sourceType)) {
      return NextResponse.json({ error: "Unsupported delivery source." }, { status: 400 });
    }

    if (!sourceId) {
      return NextResponse.json({ error: "Delivery source is required." }, { status: 400 });
    }

    if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
      return NextResponse.json({ error: "Delivery date is required." }, { status: 400 });
    }

    if (Number.isNaN(deliveredAt.getTime())) {
      return NextResponse.json({ error: "Enter a valid delivered timestamp." }, { status: 400 });
    }

    const invoiceDelivery = await createAndSendRouteDeliveryInvoice({
      sourceType,
      sourceId,
      deliveryDate,
      deliveredAt,
    });

    return NextResponse.json({
      invoice: invoiceDelivery.invoice,
      created: invoiceDelivery.created,
      emailDelivery: invoiceDelivery.emailDelivery,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not generate invoice." },
      { status: 500 }
    );
  }
}
