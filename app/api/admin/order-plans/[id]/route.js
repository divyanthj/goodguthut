import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import {
  assertValidOrderPlanStatus,
  getOrderPlanDisplayStatus,
  normalizeOneTimeOrderPlanStatus,
} from "@/libs/order-plans";
import OrderPlan from "@/models/OrderPlan";

const ensureAdmin = async () => {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return null;
};

const ensureOneTimeFulfillmentStatus = (orderPlan) => {
  if (orderPlan.mode !== "one_time") {
    return;
  }

  if (orderPlan.status === "active") {
    orderPlan.status = "confirmed";
  }
};

export async function PATCH(req, { params }) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  try {
    const body = await req.json();

    await connectMongo();
    const orderPlan = await OrderPlan.findById(params.id);

    if (!orderPlan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    ensureOneTimeFulfillmentStatus(orderPlan);

    if (orderPlan.mode === "one_time") {
      if (body?.markShipped) {
        const currentStatus = normalizeOneTimeOrderPlanStatus(orderPlan.status);

        if (currentStatus !== "confirmed") {
          return NextResponse.json(
            { error: "Only confirmed orders can be marked as shipped." },
            { status: 400 }
          );
        }

        const trackingLink = String(body?.trackingLink || "").trim();
        const now = new Date();

        orderPlan.shipment = {
          ...(orderPlan.shipment?.toObject?.() || orderPlan.shipment || {}),
          trackingLink,
          shippedAt: now,
          estimatedArrivalAt: trackingLink ? null : new Date(now.getTime() + 60 * 60 * 1000),
        };
        orderPlan.status = "shipped";
      } else if (body?.markDelivered) {
        const currentStatus = normalizeOneTimeOrderPlanStatus(orderPlan.status);

        if (!["confirmed", "shipped"].includes(currentStatus)) {
          return NextResponse.json(
            { error: "Only confirmed or shipped orders can be marked as delivered." },
            { status: 400 }
          );
        }

        const deliveredAtValue = String(body?.deliveredAt || "").trim();
        const deliveredAt = deliveredAtValue ? new Date(deliveredAtValue) : new Date();

        if (Number.isNaN(deliveredAt.getTime())) {
          return NextResponse.json({ error: "Enter a valid delivered timestamp." }, { status: 400 });
        }

        orderPlan.deliveredAt = deliveredAt;
        orderPlan.status = "fulfilled";
      } else {
        const nextStatus = String(body?.status || "").trim();
        const normalizedStatus = getOrderPlanDisplayStatus({
          mode: "one_time",
          status: nextStatus,
        });
        assertValidOrderPlanStatus(normalizedStatus, "one_time");
        orderPlan.status = normalizedStatus;
      }
    } else {
      const nextStatus = String(body?.status || "").trim();
      assertValidOrderPlanStatus(nextStatus, "recurring");
      orderPlan.status = nextStatus;
    }

    await orderPlan.save();

    return NextResponse.json({ orderPlan: JSON.parse(JSON.stringify(orderPlan)) });
  } catch (error) {
    console.error(error);

    if (error.message === "Invalid order status.") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Could not update order." }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  try {
    await connectMongo();
    const orderPlan = await OrderPlan.findByIdAndDelete(params.id);

    if (!orderPlan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not delete order." }, { status: 500 });
  }
}
