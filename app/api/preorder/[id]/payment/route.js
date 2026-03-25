import { NextResponse } from "next/server";
import { sendPreorderConfirmationEmail } from "@/libs/emailSender";
import connectMongo from "@/libs/mongoose";
import {
  createRazorpayOrder,
  extractRazorpayPaymentResult,
  getRazorpayPaymentVerificationError,
  getRazorpayPublicConfig,
  verifyRazorpayPaymentWithApi,
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
        customerPhone: preorder.phone || "",
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

    const wasAlreadyPaid = preorder.payment?.status === "paid";

    const body = await req.json();
    const { orderId: callbackOrderId, paymentId, signature } = extractRazorpayPaymentResult(body);

    const hasValidSignature = verifyRazorpayPaymentSignature({
      orderId: callbackOrderId || preorder.payment?.orderId || "",
      paymentId,
      signature,
    });
    let verifiedOrderId = callbackOrderId || preorder.payment?.orderId || "";
    let paymentCheck = null;

    if (!hasValidSignature) {
      paymentCheck = await verifyRazorpayPaymentWithApi({
        orderId: callbackOrderId || preorder.payment?.orderId || "",
        paymentId,
        expectedAmount: Math.round(Number(preorder.total || preorder.payment?.amount || 0) * 100),
        expectedCurrency: preorder.currency,
        expectedPhone: preorder.phone || "",
      });

      if (!paymentCheck.ok) {
        return NextResponse.json(
          {
            error: getRazorpayPaymentVerificationError({
              orderId: callbackOrderId || preorder.payment?.orderId || "",
              paymentId,
              signature,
              paymentCheck,
            }),
          },
          { status: 400 }
        );
      }

      verifiedOrderId = paymentCheck.payment?.order_id || verifiedOrderId;
    }

    preorder.status = "confirmed";
    preorder.payment = {
      ...(preorder.payment?.toObject?.() || preorder.payment || {}),
      provider: "razorpay",
      status: "paid",
      amount: Number(preorder.total || preorder.payment?.amount || 0),
      currency: preorder.currency,
      orderId: verifiedOrderId,
      paymentId,
      signature,
      paidAt: new Date(),
    };
    await preorder.save();

    if (!wasAlreadyPaid) {
      try {
        await sendPreorderConfirmationEmail({ preorder });
      } catch (emailError) {
        console.error("Failed to send preorder confirmation email", emailError);
      }
    }

    return NextResponse.json({
      preorder,
      confirmationMessage: "Payment received. Your preorder is confirmed.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
