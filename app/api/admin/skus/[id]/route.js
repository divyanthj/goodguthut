import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import Sku from "@/models/Sku";
import SubscriptionCombo from "@/models/SubscriptionCombo";

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

const normalizeSkuUpdatePayload = (body = {}) => ({
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

export async function GET(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

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

export async function DELETE(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const sku = await Sku.findById(params.id);

    if (!sku) {
      return NextResponse.json({ error: "SKU not found." }, { status: 404 });
    }

    const comboUsingSku = await SubscriptionCombo.exists({ "items.sku": sku.sku });

    if (comboUsingSku) {
      return NextResponse.json(
        { error: "Remove this SKU from all sets before deleting it." },
        { status: 409 }
      );
    }

    await Sku.findByIdAndDelete(params.id);

    return NextResponse.json({ success: true });
  } catch (deleteError) {
    console.error(deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
}

