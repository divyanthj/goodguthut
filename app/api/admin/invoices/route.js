import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { getInvoiceSettings } from "@/libs/invoice-settings";
import connectMongo from "@/libs/mongoose";
import Invoice from "@/models/Invoice";

export async function GET() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await connectMongo();
  const [invoices, settings] = await Promise.all([
    Invoice.find({}).sort({ invoiceDate: -1, createdAt: -1 }).limit(500),
    getInvoiceSettings(),
  ]);

  return NextResponse.json({ invoices, settings });
}
