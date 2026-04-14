import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import { assertValidOrderPlanStatus } from "@/libs/order-plans";
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

export async function PATCH(req, { params }) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  try {
    const body = await req.json();
    const nextStatus = String(body?.status || "").trim();
    assertValidOrderPlanStatus(nextStatus);

    await connectMongo();
    const orderPlan = await OrderPlan.findById(params.id);

    if (!orderPlan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    orderPlan.status = nextStatus;
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
