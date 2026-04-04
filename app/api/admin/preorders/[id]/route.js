import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import Preorder from "@/models/Preorder";
import {
  preparePreorderShippedNotifications,
} from "@/libs/shipment-notifications";

export async function PATCH(req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectMongo();

  try {
    const body = await req.json();
    const nextStatus = body.status;

    if (body.markShipped) {
      const preorder = await Preorder.findById(params.id);

      if (!preorder) {
        return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
      }

      const trackingLink = (body.trackingLink || "").trim();
      const shippedAt = new Date();
      const estimatedArrivalAt =
        preorder.fulfillmentMethod === "pickup" || trackingLink
          ? null
          : new Date(shippedAt.getTime() + 60 * 60 * 1000);

      preorder.set("shipment", {
        ...(preorder.shipment?.toObject?.() || preorder.shipment || {}),
        shippedAt,
        trackingLink,
        estimatedArrivalAt,
      });

      if (preorder.status !== "fulfilled") {
        preorder.status = "shipped";
      }

      await preorder.save();

      const notificationScaffold = await preparePreorderShippedNotifications({ preorder });

      return NextResponse.json({
        preorder,
        notificationScaffold,
        emailDelivery: { status: "manual" },
        whatsappDelivery: { status: "manual" },
      });
    }

    if (nextStatus) {
      if (!["confirmed", "shipped", "fulfilled", "cancelled", "pending"].includes(nextStatus)) {
        return NextResponse.json({ error: "Invalid preorder status." }, { status: 400 });
      }

      const preorder = await Preorder.findById(params.id);

      if (!preorder) {
        return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
      }

      preorder.status = nextStatus;

      if (nextStatus !== "fulfilled") {
        preorder.deliveredAt = body.keepDeliveredAt ? preorder.deliveredAt : null;
      }

      await preorder.save();

      return NextResponse.json({ preorder });
    }

    const deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null;

    if (!deliveredAt || Number.isNaN(deliveredAt.getTime())) {
      return NextResponse.json({ error: "A valid delivery time is required." }, { status: 400 });
    }

    const preorder = await Preorder.findById(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
    }

    preorder.deliveredAt = deliveredAt;
    preorder.status = "fulfilled";
    await preorder.save();

    return NextResponse.json({ preorder });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectMongo();

  try {
    const preorder = await Preorder.findByIdAndDelete(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
