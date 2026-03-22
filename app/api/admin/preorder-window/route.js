import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { createDefaultPreorderWindow } from "@/libs/preorder-catalog";
import {
  getLiveOpenWindowMessage,
  isWindowAcceptingOrders,
  normalizePreorderWindowPayload,
  sortPreorderWindows,
} from "@/libs/preorder-windows";
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

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const skuCatalog = await listSkuCatalog();

  const preorderWindows = await PreorderWindow.find({})
    .sort({ status: 1, deliveryDate: -1, updatedAt: -1, createdAt: -1 });

  return NextResponse.json({
    preorderWindows: sortPreorderWindows(preorderWindows),
    skuCatalog,
    defaultPreorderWindow: createDefaultPreorderWindow(),
  });
}

export async function POST(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const body = await req.json();
    const skuCatalog = await listSkuCatalog();
    const { payload, allowedItems } = normalizePreorderWindowPayload({
      body,
      fallbackTitle: "Preorder batch",
    });
    const skuCodes = new Set(skuCatalog.map((item) => item.sku));

    if (!payload.title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    if (allowedItems.length === 0) {
      return NextResponse.json(
        { error: "Add at least one SKU before saving." },
        { status: 400 }
      );
    }

    const unknownSku = allowedItems.find((item) => !skuCodes.has(item.sku));

    if (unknownSku) {
      return NextResponse.json(
        { error: `SKU ${unknownSku.sku} does not exist in the catalog.` },
        { status: 400 }
      );
    }

    if (payload.status === "open" && !payload.opensAt) {
      payload.opensAt = new Date();
    }

    if (payload.status === "open") {
      const liveOpenWindow = await PreorderWindow.findOne({ status: "open" }).sort({
        opensAt: 1,
        updatedAt: -1,
        createdAt: -1,
      });

      if (liveOpenWindow && isWindowAcceptingOrders(liveOpenWindow)) {
        const nextOpensAt = payload.opensAt ? new Date(payload.opensAt) : null;
        const currentClosesAt = liveOpenWindow.closesAt ? new Date(liveOpenWindow.closesAt) : null;
        const canScheduleAfterClose =
          currentClosesAt && nextOpensAt && nextOpensAt.getTime() > currentClosesAt.getTime();

        if (!canScheduleAfterClose) {
          return NextResponse.json(
            { error: getLiveOpenWindowMessage(liveOpenWindow) },
            { status: 400 }
          );
        }
      }
    }

    const preorderWindow = await PreorderWindow.create(payload);

    return NextResponse.json({ preorderWindow }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  return POST(req);
}
