import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import {
  enforceBrowserOrigin,
  jsonError,
  logAbuseEvent,
  readJsonBody,
} from "@/libs/request-protection";
import { buildSubscriptionRequest } from "@/libs/subscription-request";
import { sendSubscriptionEditLinkEmail } from "@/libs/subscription-notifications";
import {
  createSignedCheckoutToken,
  createRazorpayPlan,
  createRazorpaySubscription,
  getRazorpayPublicConfig,
  isRazorpayConfigured,
} from "@/libs/razorpay";
import { getSubscriptionDurationConfig } from "@/libs/subscriptions";
import Subscription from "@/models/Subscription";

const buildLineupSummary = (items = []) =>
  items.map((item) => `${item.productName} x ${item.quantity}`).join(", ");

const buildSubscriptionCheckoutPayload = ({
  subscription,
  razorpaySubscription,
  cadenceConfig,
}) => {
  const checkoutToken = createSignedCheckoutToken({
    kind: "subscription_setup",
    subscriptionRecordId: subscription.id,
    razorpaySubscriptionId: razorpaySubscription.id,
    amount: Math.round(Number(subscription.total || 0) * 100),
    currency: subscription.currency || "INR",
    email: subscription.email || "",
    phone: subscription.phone || "",
  });

  return {
    checkoutToken,
    razorpay: {
      ...getRazorpayPublicConfig(),
      subscription_id: razorpaySubscription.id,
      subscriptionId: razorpaySubscription.id,
      amount: Math.round(Number(subscription.total || 0) * 100),
      currency: subscription.currency || "INR",
      name: "Good Gut Hut",
      description: `Set up recurring auto-pay for your ${cadenceConfig.label.toLowerCase()} plan`,
      prefill: {
        name: subscription.name,
        email: subscription.email,
        contact: subscription.phone,
      },
    },
  };
};

export async function POST(req) {
  const originError = enforceBrowserOrigin(req);

  if (originError) {
    return originError;
  }

  let body;

  try {
    body = await readJsonBody(req, { maxBytes: 20 * 1024 });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("subscription-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    logAbuseEvent("subscription-invalid-json", req);
    return jsonError("Request body must be valid JSON.", 400);
  }

  try {
    const subscriptionRequest = await buildSubscriptionRequest(body);
    await connectMongo();

    const subscription = await Subscription.create({
      name: subscriptionRequest.name,
      phone: subscriptionRequest.phone,
      email: subscriptionRequest.email,
      address: subscriptionRequest.address,
      deliveryPlaceId: subscriptionRequest.deliveryPlaceId,
      normalizedDeliveryAddress: subscriptionRequest.normalizedDeliveryAddress,
      cadence: subscriptionRequest.cadence,
      durationWeeks: subscriptionRequest.durationWeeks,
      selectionMode: subscriptionRequest.selectionMode,
      comboId: subscriptionRequest.comboId,
      comboName: subscriptionRequest.comboName,
      currency: subscriptionRequest.currency,
      items: subscriptionRequest.items,
      totalQuantity: subscriptionRequest.totalQuantity,
      subtotal: subscriptionRequest.subtotal,
      deliveryFee: subscriptionRequest.deliveryFee,
      deliveryDistanceKm: subscriptionRequest.deliveryDistanceKm,
      total: subscriptionRequest.total,
      status: "new",
      source: "landing",
    });

    let checkoutPayload = null;

    if (isRazorpayConfigured() && Number(subscription.total || 0) > 0) {
      const cadenceConfig = getSubscriptionDurationConfig(
        subscription.cadence,
        subscription.durationWeeks
      );
      const lineupSummary = buildLineupSummary(subscription.items);
      const plan = await createRazorpayPlan({
        period: cadenceConfig.period,
        interval: cadenceConfig.interval,
        amount: Math.round(Number(subscription.total || 0) * 100),
        currency: subscription.currency || "INR",
        name: `Good Gut Hut ${cadenceConfig.label} Subscription`,
        description:
          lineupSummary ||
          `${cadenceConfig.label} fermented drinks subscription for ${cadenceConfig.durationLabel}`,
        notes: {
          subscriptionId: subscription.id,
          cadence: subscription.cadence,
          durationWeeks: String(subscription.durationWeeks || ""),
          email: subscription.email,
        },
      });
      const razorpaySubscription = await createRazorpaySubscription({
        planId: plan.id,
        totalCount: cadenceConfig.totalCount,
        expireBy: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        notes: {
          subscriptionId: subscription.id,
          cadence: subscription.cadence,
          durationWeeks: String(subscription.durationWeeks || ""),
          email: subscription.email,
        },
      });

      subscription.billing = {
        provider: "razorpay",
        status: razorpaySubscription.status || "created",
        planId: plan.id || "",
        subscriptionId: razorpaySubscription.id || "",
        shortUrl: razorpaySubscription.short_url || "",
        amount: subscription.total,
        currency: subscription.currency,
        totalCount: razorpaySubscription.total_count || cadenceConfig.totalCount,
        paidCount: razorpaySubscription.paid_count || 0,
        remainingCount: razorpaySubscription.remaining_count || 0,
        authAttempts: razorpaySubscription.auth_attempts || 0,
        chargeAt: razorpaySubscription.charge_at
          ? new Date(Number(razorpaySubscription.charge_at) * 1000)
          : null,
        startAt: razorpaySubscription.start_at
          ? new Date(Number(razorpaySubscription.start_at) * 1000)
          : null,
        endAt: razorpaySubscription.end_at
          ? new Date(Number(razorpaySubscription.end_at) * 1000)
          : null,
        mandateEndsAt: null,
      };
      await subscription.save();

      checkoutPayload = buildSubscriptionCheckoutPayload({
        subscription,
        razorpaySubscription,
        cadenceConfig,
      });
    }

    try {
      await sendSubscriptionEditLinkEmail({ subscription });
      subscription.lastEditLinkSentAt = new Date();
      await subscription.save();
    } catch (emailError) {
      console.error(emailError);
    }

    return NextResponse.json({
      id: subscription.id,
      checkoutToken: checkoutPayload?.checkoutToken || "",
      razorpay: checkoutPayload?.razorpay || getRazorpayPublicConfig(),
      requiresPaymentSetup: Boolean(checkoutPayload?.checkoutToken),
      message: checkoutPayload?.checkoutToken
        ? "Subscription request received. Complete the secure Razorpay setup to activate recurring auto-pay, and check your email for your secure edit link."
        : "Subscription request received. Check your email for your secure edit link.",
    });
  } catch (error) {
    console.error(error);

    if (
      error.message?.startsWith("SKU ") ||
      error.message === "Enter a valid name." ||
      error.message === "Enter a valid phone number." ||
      error.message === "Enter a valid email address." ||
      error.message === "Enter a valid delivery address." ||
      error.message === "Select a valid subscription cadence." ||
      error.message === "Select a valid subscription duration." ||
      error.message === "Select one of the available subscription combos." ||
      error.message === "Invalid delivery placeId." ||
      error.message === "Invalid delivery lookup session." ||
      error.message === "Please select a delivery address from the suggestions." ||
      error.message === "We do not deliver there yet." ||
      error.message === "Add at least one product quantity (SKU + quantity) before starting a subscription." ||
      error.message === "Too many distinct products in one subscription." ||
      error.message === "Subscriptions must include at least 4 bottles." ||
      error.message === "Subscriptions cannot include more than 10 bottles."
    ) {
      logAbuseEvent("subscription-invalid-request", req, { message: error.message });
      return jsonError(error.message, 400);
    }

    logAbuseEvent("subscription-server-error", req, { message: error.message });
    return jsonError(error.message || "Could not create subscription.", 500);
  }
}
