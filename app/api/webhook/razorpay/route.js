import { NextResponse } from "next/server";
import { headers } from "next/headers";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import { verifyRazorpayWebhookSignature } from "@/libs/razorpay";

const getRazorpayOrderIdFromEvent = (event) => {
  return event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id || "";
};

export async function POST(req) {
  const body = await req.text();
  const signature = headers().get("x-razorpay-signature");

  if (!verifyRazorpayWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid Razorpay webhook signature" }, { status: 400 });
  }

  try {
    await connectMongo();

    const event = JSON.parse(body);
    const razorpayOrderId = getRazorpayOrderIdFromEvent(event);

    if (!razorpayOrderId) {
      return NextResponse.json({ ok: true });
    }

    const preorder = await Preorder.findOne({ "payment.orderId": razorpayOrderId });

    if (!preorder) {
      return NextResponse.json({ ok: true });
    }

    const paymentEntity = event?.payload?.payment?.entity;
    const orderEntity = event?.payload?.order?.entity;

    switch (event.event) {
      case "payment.captured":
      case "order.paid": {
        preorder.status = preorder.status === "fulfilled" ? "fulfilled" : "confirmed";
        preorder.payment = {
          ...(preorder.payment?.toObject?.() || preorder.payment || {}),
          provider: "razorpay",
          status: "paid",
          orderId: paymentEntity?.order_id || orderEntity?.id || preorder.payment?.orderId || "",
          paymentId: paymentEntity?.id || preorder.payment?.paymentId || "",
          signature: signature || "",
          webhookEvent: event.event,
          amount: paymentEntity?.amount ? Number(paymentEntity.amount) / 100 : preorder.total,
          currency: paymentEntity?.currency || orderEntity?.currency || preorder.currency,
          paidAt: paymentEntity?.captured_at
            ? new Date(Number(paymentEntity.captured_at) * 1000)
            : new Date(),
        };
        await preorder.save();
        break;
      }
      case "payment.failed": {
        preorder.payment = {
          ...(preorder.payment?.toObject?.() || preorder.payment || {}),
          provider: "razorpay",
          status: "failed",
          paymentId: paymentEntity?.id || preorder.payment?.paymentId || "",
          webhookEvent: event.event,
        };
        await preorder.save();
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
