import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import Subscription from "@/models/Subscription";
import {
  cancelRazorpaySubscription,
  extractRazorpaySubscriptionResult,
  fetchRazorpayPayment,
  fetchRazorpaySubscription,
  verifyRazorpaySubscriptionCustomer,
  verifyRazorpaySubscriptionSignature,
  verifySignedCheckoutToken,
} from "@/libs/razorpay";

const sanitizeSubscription = (subscription) => ({
  id: subscription.id,
  name: subscription.name,
  email: subscription.email,
  phone: subscription.phone,
  address: subscription.address,
  deliveryPlaceId: subscription.deliveryPlaceId || "",
  normalizedDeliveryAddress: subscription.normalizedDeliveryAddress || "",
  cadence: subscription.cadence,
  currency: subscription.currency,
  items: subscription.items || [],
  totalQuantity: subscription.totalQuantity,
  subtotal: subscription.subtotal,
  deliveryFee: subscription.deliveryFee,
  deliveryDistanceKm: subscription.deliveryDistanceKm,
  total: subscription.total,
  status: subscription.status,
  billing: subscription.billing || {},
  updatedAt: subscription.updatedAt,
});

const syncSubscriptionBilling = async ({
  subscription,
  razorpaySubscription,
  paymentId = "",
}) => {
  const payment = paymentId ? await fetchRazorpayPayment(paymentId) : null;
  const effectiveStatus =
    razorpaySubscription.status === "created" && paymentId
      ? "authenticated"
      : razorpaySubscription.status || subscription.billing?.status || "created";

  subscription.billing = {
    ...(subscription.billing?.toObject?.() || subscription.billing || {}),
    provider: "razorpay",
    status: effectiveStatus,
    subscriptionId: razorpaySubscription.id || subscription.billing?.subscriptionId || "",
    planId: razorpaySubscription.plan_id || subscription.billing?.planId || "",
    shortUrl:
      ["authenticated", "active", "completed", "cancelled", "expired"].includes(
        effectiveStatus
      )
        ? ""
        : razorpaySubscription.short_url || subscription.billing?.shortUrl || "",
    amount: subscription.total,
    currency: subscription.currency || razorpaySubscription?.currency || "INR",
    totalCount: razorpaySubscription.total_count || subscription.billing?.totalCount || 0,
    paidCount: razorpaySubscription.paid_count || subscription.billing?.paidCount || 0,
    remainingCount: razorpaySubscription.remaining_count || subscription.billing?.remainingCount || 0,
    authAttempts: razorpaySubscription.auth_attempts || subscription.billing?.authAttempts || 0,
    chargeAt: razorpaySubscription.charge_at
      ? new Date(Number(razorpaySubscription.charge_at) * 1000)
      : subscription.billing?.chargeAt || null,
    startAt: razorpaySubscription.start_at
      ? new Date(Number(razorpaySubscription.start_at) * 1000)
      : subscription.billing?.startAt || null,
    endAt: razorpaySubscription.end_at
      ? new Date(Number(razorpaySubscription.end_at) * 1000)
      : subscription.billing?.endAt || null,
    currentStart: razorpaySubscription.current_start
      ? new Date(Number(razorpaySubscription.current_start) * 1000)
      : subscription.billing?.currentStart || null,
    currentEnd: razorpaySubscription.current_end
      ? new Date(Number(razorpaySubscription.current_end) * 1000)
      : subscription.billing?.currentEnd || null,
    lastPaymentId: payment?.id || paymentId || subscription.billing?.lastPaymentId || "",
    lastPaymentStatus: payment?.status || subscription.billing?.lastPaymentStatus || "",
    authenticatedAt:
      effectiveStatus === "authenticated"
        ? subscription.billing?.authenticatedAt || new Date()
        : subscription.billing?.authenticatedAt || null,
    activatedAt:
      effectiveStatus === "active"
        ? subscription.billing?.activatedAt || new Date()
        : subscription.billing?.activatedAt || null,
    cancelledAt:
      effectiveStatus === "cancelled"
        ? subscription.billing?.cancelledAt || new Date()
        : subscription.billing?.cancelledAt || null,
    completedAt:
      effectiveStatus === "completed"
        ? subscription.billing?.completedAt || new Date()
        : subscription.billing?.completedAt || null,
    expiredAt:
      effectiveStatus === "expired"
        ? subscription.billing?.expiredAt || new Date()
        : subscription.billing?.expiredAt || null,
  };

  if (["authenticated", "active"].includes(effectiveStatus)) {
    subscription.status = subscription.status === "cancelled" ? "cancelled" : "active";
  }
};

export async function PATCH(req) {
  try {
    await connectMongo();

    const body = await req.json();
    const { subscriptionId: callbackSubscriptionId, paymentId, signature } =
      extractRazorpaySubscriptionResult(body);
    const checkoutToken = body.checkoutToken || "";
    const checkoutSession = verifySignedCheckoutToken(checkoutToken);

    if (!checkoutSession || checkoutSession.kind !== "subscription_setup") {
      return NextResponse.json(
        { error: "This subscription payment session has expired. Please try again." },
        { status: 400 }
      );
    }

    const subscription = await Subscription.findById(checkoutSession.subscriptionRecordId);

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }

    const razorpaySubscriptionId =
      callbackSubscriptionId || checkoutSession.razorpaySubscriptionId || subscription.billing?.subscriptionId || "";

    if (
      !razorpaySubscriptionId ||
      razorpaySubscriptionId !== subscription.billing?.subscriptionId
    ) {
      return NextResponse.json(
        { error: "Payment verification failed because the subscription IDs did not match." },
        { status: 400 }
      );
    }

    const hasValidSignature = verifyRazorpaySubscriptionSignature({
      subscriptionId: razorpaySubscriptionId,
      paymentId,
      signature,
    });

    if (!hasValidSignature) {
      return NextResponse.json(
        { error: "Payment verification failed because Razorpay returned an invalid signature." },
        { status: 400 }
      );
    }

    const razorpaySubscription = await fetchRazorpaySubscription(razorpaySubscriptionId);

    if (!razorpaySubscription) {
      return NextResponse.json(
        { error: "Payment verification failed because the subscription could not be fetched from Razorpay." },
        { status: 400 }
      );
    }

    const payment = paymentId ? await fetchRazorpayPayment(paymentId) : null;
    const customerCheck = verifyRazorpaySubscriptionCustomer({
      payment,
      expectedEmail: subscription.email,
      expectedPhone: subscription.phone,
    });

    if (!customerCheck.ok) {
      try {
        await cancelRazorpaySubscription({
          subscriptionId: razorpaySubscriptionId,
          cancelAtCycleEnd: false,
        });
      } catch (cancelError) {
        console.error("Failed to cancel mismatched Razorpay subscription", cancelError);
      }

      return NextResponse.json(
        {
          error:
            customerCheck.reason === "email_mismatch"
              ? "Payment verification failed because the Razorpay payment email did not match the subscription email."
              : customerCheck.reason === "phone_mismatch"
                ? "Payment verification failed because the Razorpay payment phone number did not match the subscription phone number."
                : "Payment verification failed because the Razorpay payment details could not be verified.",
        },
        { status: 400 }
      );
    }

    await syncSubscriptionBilling({
      subscription,
      razorpaySubscription,
      paymentId,
    });
    await subscription.save();

    return NextResponse.json({
      subscription: sanitizeSubscription(subscription),
      confirmationMessage:
        subscription.billing?.status === "active"
          ? "Recurring payment is active and your subscription is confirmed."
          : subscription.billing?.status === "authenticated"
            ? "Auto-pay is confirmed and your subscription is ready."
            : "Payment setup was received and your subscription is being synced.",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not verify subscription payment." },
      { status: 500 }
    );
  }
}
