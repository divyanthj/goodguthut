import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import {
  getInvoiceSettings,
  normalizeInvoiceSettingsPayload,
} from "@/libs/invoice-settings";
import connectMongo from "@/libs/mongoose";

export async function GET() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await connectMongo();
  const settings = await getInvoiceSettings();

  return NextResponse.json({ settings });
}

export async function PUT(req) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await connectMongo();

  try {
    const settings = await getInvoiceSettings();
    settings.set(normalizeInvoiceSettingsPayload(await req.json()));
    await settings.save();

    return NextResponse.json({ settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not save invoice settings." },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
  return PUT(req);
}
