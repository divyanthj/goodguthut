import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import {
  normalizePaymentNudgeOrder,
  sendPaymentNudgeEmail,
} from "@/libs/payment-nudge-notifications";
import { createRazorpayPaymentLink } from "@/libs/razorpay";
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

const isPendingPaymentOrSetup = (order = {}) => {
  const paymentStatus = String(order.payment?.status || "").trim();
  const paymentProvider = String(order.payment?.provider || "").trim();

  if (order.mode === "recurring") {
    return paymentStatus === "created";
  }

  if (paymentProvider === "manual") {
    return false;
  }

  return ["pending", "order_created", "created"].includes(paymentStatus);
};

const ensureRazorpayPaymentLink = async ({ sourceType, record }) => {
  const order = normalizePaymentNudgeOrder({ sourceType, record });

  if (!isPendingPaymentOrSetup(order) || order.payment?.shortUrl) {
    return order;
  }

  if (order.mode === "recurring" || order.payment?.provider !== "razorpay") {
    return order;
  }

  const referencePrefix = sourceType === "legacy_preorder" ? "preorder" : "order";
  const shortOrderId = String(order.id || "").slice(-10);
  const shortTimestamp = Date.now().toString(36).slice(-8);
  const paymentLink = await createRazorpayPaymentLink({
    amount: Math.round(Number(order.total || order.payment?.amount || 0) * 100),
    currency: order.currency || order.payment?.currency || "INR",
    referenceId: `${referencePrefix}_${shortOrderId}_${shortTimestamp}`.slice(0, 40),
    description: `Good Gut Hut ${order.orderNumber || order.id}`,
    customer: {
      name: order.customerName,
      email: order.email,
      contact: order.phone,
    },
    notes: {
      sourceType,
      orderPlanId: sourceType === "order_plan" ? order.id : "",
      preorderId: sourceType === "legacy_preorder" ? order.id : "",
      razorpayOrderId: order.payment?.orderId || "",
      orderNumber: order.orderNumber || "",
    },
  });

  record.payment = {
    ...(record.payment?.toObject?.() || record.payment || {}),
    provider: "razorpay",
    status: record.payment?.status || "order_created",
    amount: Number(order.total || record.payment?.amount || 0),
    currency: order.currency || record.payment?.currency || "INR",
    orderId: record.payment?.orderId || "",
    paymentLinkId: paymentLink.id || "",
    shortUrl: paymentLink.short_url || "",
  };
  await record.save();

  return normalizePaymentNudgeOrder({ sourceType, record });
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

    const order = await ensureRazorpayPaymentLink({ sourceType, record });
    const emailDelivery = await sendPaymentNudgeEmail({ order });

    return NextResponse.json({
      emailDelivery,
      [sourceType === "legacy_preorder" ? "preorder" : "orderPlan"]: JSON.parse(
        JSON.stringify(record)
      ),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not send payment nudge email." },
      { status: 500 }
    );
  }
}
