import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import {
  getLiveOpenWindowMessage,
  isWindowAcceptingOrders,
  normalizePreorderWindowPayload,
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

export async function GET(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  const preorderWindow = await PreorderWindow.findById(params.id);

  if (!preorderWindow) {
    return NextResponse.json({ error: "Preorder window not found." }, { status: 404 });
  }

  return NextResponse.json({ preorderWindow });
}

export async function PUT(req, { params }) {
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

    const existingWindow = await PreorderWindow.findById(params.id);

    if (!existingWindow) {
      return NextResponse.json({ error: "Preorder window not found." }, { status: 404 });
    }

    const willBeOpen = payload.status === "open";

    if (willBeOpen && !payload.opensAt) {
      payload.opensAt = existingWindow.opensAt || new Date();
    }

    if (willBeOpen) {
      const liveOpenWindow = await PreorderWindow.findOne({
        status: "open",
        _id: { $ne: existingWindow._id },
      }).sort({
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

    const preorderWindow = await PreorderWindow.findByIdAndUpdate(params.id, payload, {
      new: true,
      runValidators: true,
    });

    return NextResponse.json({ preorderWindow });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const body = await req.json();
    const nextStatus = body.status;

    if (!["draft", "open", "closed", "archived"].includes(nextStatus)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const preorderWindow = await PreorderWindow.findById(params.id);

    if (!preorderWindow) {
      return NextResponse.json({ error: "Preorder window not found." }, { status: 404 });
    }

    preorderWindow.status = nextStatus;

    if (nextStatus === "open" && !preorderWindow.opensAt) {
      preorderWindow.opensAt = new Date();
    }

    if (nextStatus === "open") {
      const liveOpenWindow = await PreorderWindow.findOne({
        status: "open",
        _id: { $ne: preorderWindow._id },
      }).sort({
        opensAt: 1,
        updatedAt: -1,
        createdAt: -1,
      });

      if (liveOpenWindow && isWindowAcceptingOrders(liveOpenWindow)) {
        const currentClosesAt = liveOpenWindow.closesAt ? new Date(liveOpenWindow.closesAt) : null;
        const nextOpensAt = preorderWindow.opensAt ? new Date(preorderWindow.opensAt) : null;
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

    await preorderWindow.save();

    return NextResponse.json({ preorderWindow });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
