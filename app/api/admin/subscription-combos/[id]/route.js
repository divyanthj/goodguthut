import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import { getSkuMap, listSkuCatalog } from "@/libs/sku-catalog";
import {
  hydrateSubscriptionCombo,
  validateSubscriptionComboItems,
} from "@/libs/subscription-combos";
import SubscriptionCombo from "@/models/SubscriptionCombo";

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

const normalizeComboPayload = (body = {}) => ({
  name: (body.name || "").trim(),
  description: (body.description || "").trim(),
  status: ["active", "draft", "archived"].includes(body.status) ? body.status : "draft",
  sortOrder: Number(body.sortOrder || 0),
  isFeatured: body.isFeatured === true,
  items: Array.isArray(body.items) ? body.items : [],
});

export async function GET(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const skuCatalog = await listSkuCatalog();
  const skuMap = getSkuMap(skuCatalog);
  const combo = await SubscriptionCombo.findById(params.id);

  if (!combo) {
    return NextResponse.json({ error: "Combo not found." }, { status: 404 });
  }

  return NextResponse.json({ combo: hydrateSubscriptionCombo(combo, skuMap) });
}

export async function PUT(req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const payload = normalizeComboPayload(await req.json());

    if (!payload.name) {
      return NextResponse.json({ error: "Combo name is required." }, { status: 400 });
    }

    const skuCatalog = await listSkuCatalog();
    const skuMap = getSkuMap(skuCatalog);
    const items = validateSubscriptionComboItems(payload.items, skuMap);
    const combo = await SubscriptionCombo.findByIdAndUpdate(
      params.id,
      {
        ...payload,
        items,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!combo) {
      return NextResponse.json({ error: "Combo not found." }, { status: 404 });
    }

    return NextResponse.json({ combo: hydrateSubscriptionCombo(combo, skuMap) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const deletedCombo = await SubscriptionCombo.findByIdAndDelete(params.id);

    if (!deletedCombo) {
      return NextResponse.json({ error: "Box not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (deleteError) {
    console.error(deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
}
