import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { sendInvoiceEmail } from "@/libs/invoices";
import connectMongo from "@/libs/mongoose";
import Invoice from "@/models/Invoice";

export async function POST(_req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await connectMongo();
  const invoice = await Invoice.findById(params.id);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const emailDelivery = await sendInvoiceEmail({ invoice });

  return NextResponse.json({
    invoice,
    emailDelivery,
  });
}
