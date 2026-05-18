import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import {
  normalizeProductionConfirmationOrder,
  sendProductionConfirmationEmail,
} from "@/libs/production-confirmation-notifications";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";

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

export async function POST(req) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  try {
    const body = await req.json();
    const sourceType = String(body?.sourceType || "").trim();
    const orderId = String(body?.id || "").trim();

    if (!orderId || !["legacy_preorder", "order_plan"].includes(sourceType)) {
      return NextResponse.json({ error: "A valid order is required." }, { status: 400 });
    }

    await connectMongo();

    const record =
      sourceType === "legacy_preorder"
        ? await Preorder.findById(orderId)
        : await OrderPlan.findById(orderId);

    if (!record) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const order = normalizeProductionConfirmationOrder({ sourceType, record });
    const emailDelivery = await sendProductionConfirmationEmail({ order });

    return NextResponse.json({ emailDelivery });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not send production confirmation email." },
      { status: 500 }
    );
  }
}
