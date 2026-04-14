import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import Sku from "@/models/Sku";
import { listSkuCatalog } from "@/libs/sku-catalog";

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
  status: body.status === "archived" ? "archived" : "active",
  skuType:
    body.isSeasonal === true || body.skuType === "seasonal"
      ? "seasonal"
      : "perennial",
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
