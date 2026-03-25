import { NextResponse } from "next/server";
import { sendPreorderConfirmationEmail } from "@/libs/emailSender";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import {
  extractRazorpayPaymentResult,
  getRazorpayPaymentVerificationError,
  verifyRazorpayPaymentWithApi,
  verifyRazorpayPaymentSignature,
  verifySignedCheckoutToken,
} from "@/libs/razorpay";

const buildPreorderPayload = (orderRequest, paymentResult) => ({
  customerName: orderRequest.customerName,
  email: orderRequest.email,
  phone: orderRequest.phone,
  address: orderRequest.address,
  normalizedDeliveryAddress: orderRequest.normalizedDeliveryAddress,
  customerNotes: orderRequest.customerNotes,
  preorderWindow: orderRequest.preorderWindow?.id || null,
  preorderWindowLabel: orderRequest.preorderWindow?.title || "",
  deliveryDate: orderRequest.preorderWindow?.deliveryDate || null,
  currency: orderRequest.currency,
  items: orderRequest.items,
  totalQuantity: orderRequest.totalQuantity,
  subtotal: orderRequest.subtotal,
  deliveryFee: orderRequest.deliveryFee,
  deliveryDistanceKm: orderRequest.deliveryDistanceKm,
  total: orderRequest.total,
  source: "landing",
  status: "confirmed",
  payment: {
    provider: "razorpay",
    status: "paid",
    amount: orderRequest.total,
    currency: orderRequest.currency,
    orderId: paymentResult.orderId,
    paymentId: paymentResult.paymentId,
    signature: paymentResult.signature,
    paidAt: new Date(),
  },
});

export async function PATCH(req) {
  try {
    await connectMongo();

    const body = await req.json();
    const { orderId: callbackOrderId, paymentId, signature } = extractRazorpayPaymentResult(body);
    const checkoutToken = body.checkoutToken || "";
    const checkoutSession = verifySignedCheckoutToken(checkoutToken);

    if (!checkoutSession) {
      return NextResponse.json({ error: "This payment session has expired. Please try again." }, { status: 400 });
    }

    const hasValidSignature = verifyRazorpayPaymentSignature({
      orderId: callbackOrderId || checkoutSession.razorpayOrderId || "",
      paymentId,
      signature,
    });
    let verifiedOrderId = callbackOrderId || checkoutSession.razorpayOrderId || "";
    let paymentCheck = null;

    if (!hasValidSignature) {
      paymentCheck = await verifyRazorpayPaymentWithApi({
        orderId: callbackOrderId || checkoutSession.razorpayOrderId || "",
        paymentId,
        expectedAmount: checkoutSession.amount,
        expectedCurrency: checkoutSession.currency,
        expectedPhone: checkoutSession.orderRequest?.phone || "",
      });

      if (!paymentCheck.ok) {
        return NextResponse.json(
          {
            error: getRazorpayPaymentVerificationError({
              orderId: callbackOrderId || checkoutSession.razorpayOrderId || "",
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

    if (Number(checkoutSession.amount || 0) <= 0) {
      return NextResponse.json({ error: "Payment order does not match this checkout session." }, { status: 400 });
    }

    const existingPreorder = await Preorder.findOne({
      $or: [{ "payment.paymentId": paymentId }, { "payment.orderId": verifiedOrderId }],
    });

    if (existingPreorder) {
      return NextResponse.json({
        preorder: existingPreorder,
        confirmationMessage: "Payment received. Your preorder is confirmed.",
      });
    }

    const preorder = await Preorder.create(
      buildPreorderPayload(checkoutSession.orderRequest, {
        orderId: verifiedOrderId,
        paymentId,
        signature,
      })
    );

    let emailDelivery = { status: "skipped" };

    try {
      await sendPreorderConfirmationEmail({ preorder });
      emailDelivery = { status: "sent" };
    } catch (emailError) {
      console.error("Failed to send preorder confirmation email", emailError);
      emailDelivery = { status: "failed" };
    }

    return NextResponse.json({
      preorder,
      emailDelivery,
      confirmationMessage: "Payment received. Your preorder is confirmed.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
