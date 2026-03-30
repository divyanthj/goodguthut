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
  createRazorpayPlan,
  createRazorpaySubscription,
  isRazorpayConfigured,
} from "@/libs/razorpay";
import { getSubscriptionCadenceConfig } from "@/libs/subscriptions";
import Subscription from "@/models/Subscription";

const buildLineupSummary = (items = []) =>
  items.map((item) => `${item.productName} x ${item.quantity}`).join(", ");

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

    let checkoutUrl = "";

    if (isRazorpayConfigured() && Number(subscription.total || 0) > 0) {
      const cadenceConfig = getSubscriptionCadenceConfig(subscription.cadence);
      const lineupSummary = buildLineupSummary(subscription.items);
      const plan = await createRazorpayPlan({
        period: cadenceConfig.period,
        interval: cadenceConfig.interval,
        amount: Math.round(Number(subscription.total || 0) * 100),
        currency: subscription.currency || "INR",
        name: `Good Gut Hut ${cadenceConfig.label} Subscription`,
        description: lineupSummary || `${cadenceConfig.label} fermented drinks subscription`,
        notes: {
          subscriptionId: subscription.id,
          cadence: subscription.cadence,
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
          email: subscription.email,
        },
      });

      checkoutUrl = razorpaySubscription.short_url || "";
      subscription.billing = {
        provider: "razorpay",
        status: razorpaySubscription.status || "created",
        planId: plan.id || "",
        subscriptionId: razorpaySubscription.id || "",
        shortUrl: checkoutUrl,
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
      };
      await subscription.save();
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
      checkoutUrl,
      requiresPaymentSetup: Boolean(checkoutUrl),
      message: checkoutUrl
        ? "Subscription request received. Continue to Razorpay to set up recurring auto-pay, and check your email for your secure edit link."
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
      error.message === "Invalid delivery placeId." ||
      error.message === "Invalid delivery lookup session." ||
      error.message === "Please select a delivery address from the suggestions." ||
      error.message === "We do not deliver there yet." ||
      error.message === "Add at least one product quantity (SKU + quantity) before starting a subscription." ||
      error.message === "Too many distinct products in one subscription."
    ) {
      logAbuseEvent("subscription-invalid-request", req, { message: error.message });
      return jsonError(error.message, 400);
    }

    logAbuseEvent("subscription-server-error", req, { message: error.message });
    return jsonError(error.message || "Could not create subscription.", 500);
  }
}
