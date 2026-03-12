import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import Sku from "@/models/Sku";
import { ensureSkuCatalogSeeded } from "@/libs/sku-catalog";

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

const normalizeSkuUpdatePayload = (body = {}) => ({
  name: (body.name || "").trim(),
  notes: (body.notes || "").trim(),
  unitPrice: Math.max(0, Number(body.unitPrice || 0)),
  status: body.status === "archived" ? "archived" : "active",
});

export async function GET(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  await ensureSkuCatalogSeeded();

  const sku = await Sku.findById(params.id);

  if (!sku) {
    return NextResponse.json({ error: "SKU not found." }, { status: 404 });
  }

  return NextResponse.json({ sku });
}

export async function PUT(req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    await ensureSkuCatalogSeeded();
    const payload = normalizeSkuUpdatePayload(await req.json());

    if (!payload.name) {
      return NextResponse.json({ error: "SKU name is required." }, { status: 400 });
    }

    const sku = await Sku.findByIdAndUpdate(params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!sku) {
      return NextResponse.json({ error: "SKU not found." }, { status: 404 });
    }

    return NextResponse.json({ sku });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  return PUT(req, { params });
}
