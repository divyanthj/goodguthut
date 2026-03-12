import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { createDefaultAllowedItems, createDefaultPreorderWindow } from "@/libs/preorder-catalog";
import {
  normalizePreorderWindowPayload,
  sortPreorderWindows,
} from "@/libs/preorder-windows";

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

const closeOtherOpenWindows = async (excludeId) => {
  const filter = { status: "open" };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  await PreorderWindow.updateMany(filter, { status: "closed" });
};

export async function GET() {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  const preorderWindows = await PreorderWindow.find({})
    .sort({ status: 1, deliveryDate: -1, updatedAt: -1, createdAt: -1 });

  return NextResponse.json({
    preorderWindows: sortPreorderWindows(preorderWindows),
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
    const { payload, allowedItems } = normalizePreorderWindowPayload({
      body,
      fallbackTitle: "Preorder batch",
      fallbackItems: createDefaultAllowedItems(),
    });

    if (!payload.title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    if (allowedItems.length === 0) {
      return NextResponse.json(
        { error: "Add at least one SKU before saving." },
        { status: 400 }
      );
    }

    if (payload.status === "open" && !payload.opensAt) {
      payload.opensAt = new Date();
    }

    const preorderWindow = await PreorderWindow.create(payload);

    if (payload.status === "open") {
      await closeOtherOpenWindows(preorderWindow._id);
    }

    return NextResponse.json({ preorderWindow }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req) {
  return POST(req);
}
