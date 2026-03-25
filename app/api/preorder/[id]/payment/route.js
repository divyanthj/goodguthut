import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import {
  createRazorpayOrder,
  extractRazorpayPaymentResult,
  getRazorpayPublicConfig,
  verifyRazorpayPaymentSignature,
} from "@/libs/razorpay";
import Preorder from "@/models/Preorder";

export async function POST(_req, { params }) {
  try {
    await connectMongo();

    const preorder = await Preorder.findById(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found" }, { status: 404 });
    }

    if (Number(preorder.total || 0) <= 0) {
      return NextResponse.json(
        { error: "This preorder does not have a payable amount." },
        { status: 400 }
      );
    }

    const razorpayOrder = await createRazorpayOrder({
      amount: Math.round(Number(preorder.total) * 100),
      currency: preorder.currency || "INR",
      receipt: `preorder_${preorder.id}`,
      notes: {
        preorderId: preorder.id,
        customerName: preorder.customerName,
        customerEmail: preorder.email || "",
      },
    });

    preorder.status = "payment_pending";
    preorder.payment = {
      ...(preorder.payment?.toObject?.() || preorder.payment || {}),
      provider: "razorpay",
      status: "order_created",
      amount: preorder.total,
      currency: preorder.currency,
      orderId: razorpayOrder.id,
    };
    await preorder.save();

    return NextResponse.json({
      preorderId: preorder.id,
      razorpay: {
        ...getRazorpayPublicConfig(),
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "Good Gut Hut",
        description: `Preorder ${preorder.id}`,
        prefill: {
          name: preorder.customerName,
          email: preorder.email,
          contact: preorder.phone,
        },
        notes: {
          preorderId: preorder.id,
        },
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    await connectMongo();

    const preorder = await Preorder.findById(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found" }, { status: 404 });
    }

    const body = await req.json();
    const { orderId, paymentId, signature } = extractRazorpayPaymentResult(body);

    if (!verifyRazorpayPaymentSignature({ orderId, paymentId, signature })) {
      return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
    }

    if (preorder.payment?.orderId && preorder.payment.orderId !== orderId) {
      return NextResponse.json({ error: "Payment order does not match this preorder." }, { status: 400 });
    }

    preorder.status = "confirmed";
    preorder.payment = {
      ...(preorder.payment?.toObject?.() || preorder.payment || {}),
      provider: "razorpay",
      status: "paid",
      amount: Number(preorder.total || preorder.payment?.amount || 0),
      currency: preorder.currency,
      orderId,
      paymentId,
      signature,
      paidAt: new Date(),
    };
    await preorder.save();

    return NextResponse.json({
      preorder,
      confirmationMessage: "Payment received. Your preorder is confirmed.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
