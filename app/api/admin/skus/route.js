import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import Sku from "@/models/Sku";
import { listSkuCatalog } from "@/libs/sku-catalog";

const normalizeRecurringCutoffDate = (value = "") => {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
};

const normalizeGstRate = (value = 0) => {
  const rate = Number(value || 0);
  return Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 0;
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

const normalizeSkuPayload = (body = {}) => ({
  sku: (body.sku || "").trim().toUpperCase(),
  name: (body.name || "").trim(),
  notes: (body.notes || "").trim(),
  unitPrice: Math.max(0, Number(body.unitPrice || 0)),
  hsnCode: String(body.hsnCode || "").trim(),
  gstRate: normalizeGstRate(body.gstRate),
  status: body.status === "archived" ? "archived" : "active",
  skuType:
    body.isSeasonal === true || body.skuType === "seasonal"
      ? "seasonal"
      : "perennial",
  recurringCutoffDate: normalizeRecurringCutoffDate(body.recurringCutoffDate),
});

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const skuCatalog = await listSkuCatalog();

  return NextResponse.json({ skuCatalog });
}

export async function POST(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const payload = normalizeSkuPayload(await req.json());

    if (!payload.sku || !payload.name) {
      return NextResponse.json({ error: "SKU code and name are required." }, { status: 400 });
    }

    const existingSku = await Sku.findOne({ sku: payload.sku });

    if (existingSku) {
      return NextResponse.json({ error: "SKU already exists." }, { status: 400 });
    }

    const sku = await Sku.create(payload);
    return NextResponse.json({ sku }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
