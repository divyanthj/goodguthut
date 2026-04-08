import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import { getSkuMap, listSkuCatalog } from "@/libs/sku-catalog";
import {
  hydrateSubscriptionCombo,
  listSubscriptionCombos,
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

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const [skuCatalog, comboDocs] = await Promise.all([
    listSkuCatalog(),
    listSubscriptionCombos(),
  ]);
  const skuMap = getSkuMap(skuCatalog);
  const combos = comboDocs.map((combo) => hydrateSubscriptionCombo(combo, skuMap));

  return NextResponse.json({ skuCatalog, combos });
}

export async function POST(req) {
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
    const combo = await SubscriptionCombo.create({
      ...payload,
      items,
    });

    return NextResponse.json(
      { combo: hydrateSubscriptionCombo(combo, skuMap) },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
