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
import { verifySignedSubscriptionEditToken } from "@/libs/subscription-edit-links";
import {
  cancelRazorpaySubscription,
  createRazorpayPlan,
  createRazorpaySubscription,
  isRazorpayConfigured,
} from "@/libs/razorpay";
import {
  getSubscriptionCadenceConfig,
  isMutableBillingStatus,
} from "@/libs/subscriptions";
import Subscription from "@/models/Subscription";

const sanitizeSubscription = (subscription) => ({
  id: subscription.id,
  name: subscription.name,
  phone: subscription.phone,
  email: subscription.email,
  address: subscription.address,
  deliveryPlaceId: subscription.deliveryPlaceId || "",
  normalizedDeliveryAddress: subscription.normalizedDeliveryAddress,
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

const resolveSubscriptionFromToken = async (token) => {
  const verification = verifySignedSubscriptionEditToken(token);

  if (!verification.isValid) {
    return { error: verification.reason || "invalid_token" };
  }

  await connectMongo();
  const subscription = await Subscription.findById(verification.subscriptionId);

  if (!subscription) {
    return { error: "not_found" };
  }

  if ((subscription.email || "").trim().toLowerCase() !== verification.email) {
    return { error: "invalid_token" };
  }

  return { subscription };
};

const buildLineupSummary = (items = []) =>
  items.map((item) => `${item.productName} x ${item.quantity}`).join(", ");

const syncBillingForSubscription = async (subscription) => {
  if (!isRazorpayConfigured() || Number(subscription.total || 0) <= 0) {
    subscription.billing = {
      ...(subscription.billing?.toObject?.() || subscription.billing || {}),
      provider: "",
      status: "created",
      planId: "",
      subscriptionId: "",
      shortUrl: "",
      amount: subscription.total,
      currency: subscription.currency,
    };
    return "";
  }

  if (
    subscription.billing?.subscriptionId &&
    subscription.billing?.status === "created"
  ) {
    try {
      await cancelRazorpaySubscription({
        subscriptionId: subscription.billing.subscriptionId,
        cancelAtCycleEnd: false,
      });
    } catch (cancelError) {
      console.error("Failed to cancel prior Razorpay subscription", cancelError);
    }
  }

  const cadenceConfig = getSubscriptionCadenceConfig(subscription.cadence);
  const plan = await createRazorpayPlan({
    period: cadenceConfig.period,
    interval: cadenceConfig.interval,
    amount: Math.round(Number(subscription.total || 0) * 100),
    currency: subscription.currency || "INR",
    name: `Good Gut Hut ${cadenceConfig.label} Subscription`,
    description: buildLineupSummary(subscription.items) || `${cadenceConfig.label} fermented drinks subscription`,
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

  subscription.billing = {
    ...(subscription.billing?.toObject?.() || subscription.billing || {}),
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
  };

  return razorpaySubscription.short_url || "";
};

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token") || "";

  try {
    const { subscription, error } = await resolveSubscriptionFromToken(token);

    if (error === "expired") {
      return jsonError("This edit link has expired. Request a fresh link below.", 410);
    }

    if (error) {
      return jsonError("This edit link is invalid. Request a fresh link below.", 400);
    }

    return NextResponse.json({ subscription: sanitizeSubscription(subscription) });
  } catch (routeError) {
    console.error(routeError);
    return jsonError(routeError.message || "Could not load subscription.", 500);
  }
}

export async function PATCH(req) {
  const originError = enforceBrowserOrigin(req);

  if (originError) {
    return originError;
  }

  let body;

  try {
    body = await readJsonBody(req, { maxBytes: 20 * 1024 });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("subscription-edit-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    logAbuseEvent("subscription-edit-invalid-json", req);
    return jsonError("Request body must be valid JSON.", 400);
  }

  try {
    const token = body.token || "";
    const resolved = await resolveSubscriptionFromToken(token);

    if (resolved.error === "expired") {
      return jsonError("This edit link has expired. Request a fresh link below.", 410);
    }

    if (resolved.error === "not_found") {
      return jsonError("Subscription not found.", 404);
    }

    if (resolved.error) {
      return jsonError("This edit link is invalid. Request a fresh link below.", 400);
    }

    const subscription = resolved.subscription;

    if (
      subscription.billing?.subscriptionId &&
      !isMutableBillingStatus(subscription.billing?.status)
    ) {
      return jsonError(
        "This subscription already has an active Razorpay mandate. Please email support to make billing changes.",
        400
      );
    }

    const nextRequest = await buildSubscriptionRequest(body);
    const previousEmail = subscription.email;

    subscription.name = nextRequest.name;
    subscription.phone = nextRequest.phone;
    subscription.email = nextRequest.email;
    subscription.address = nextRequest.address;
    subscription.deliveryPlaceId = nextRequest.deliveryPlaceId;
    subscription.normalizedDeliveryAddress = nextRequest.normalizedDeliveryAddress;
    subscription.cadence = nextRequest.cadence;
    subscription.currency = nextRequest.currency;
    subscription.items = nextRequest.items;
    subscription.totalQuantity = nextRequest.totalQuantity;
    subscription.subtotal = nextRequest.subtotal;
    subscription.deliveryFee = nextRequest.deliveryFee;
    subscription.deliveryDistanceKm = nextRequest.deliveryDistanceKm;
    subscription.total = nextRequest.total;

    const checkoutUrl = await syncBillingForSubscription(subscription);
    await subscription.save();

    let emailChanged = false;

    if (previousEmail !== subscription.email) {
      emailChanged = true;
    }

    if (emailChanged || !subscription.lastEditLinkSentAt) {
      try {
        await sendSubscriptionEditLinkEmail({
          subscription,
          subject: emailChanged
            ? "Your updated Good Gut Hut edit link"
            : "Your Good Gut Hut edit link",
        });
        subscription.lastEditLinkSentAt = new Date();
        await subscription.save();
      } catch (emailError) {
        console.error(emailError);
      }
    }

    return NextResponse.json({
      subscription: sanitizeSubscription(subscription),
      emailChanged,
      checkoutUrl,
      requiresPaymentSetup: Boolean(checkoutUrl),
      message: emailChanged
        ? "Subscription updated. We emailed a fresh edit link to your new address."
        : checkoutUrl
          ? "Subscription updated. Continue to Razorpay to confirm the recurring payment setup for these changes."
          : "Subscription updated.",
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
      return jsonError(error.message, 400);
    }

    return jsonError(error.message || "Could not update subscription.", 500);
  }
}

export async function DELETE(req) {
  const originError = enforceBrowserOrigin(req);

  if (originError) {
    return originError;
  }

  let body;

  try {
    body = await readJsonBody(req, { maxBytes: 8 * 1024 });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("subscription-cancel-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    logAbuseEvent("subscription-cancel-invalid-json", req);
    return jsonError("Request body must be valid JSON.", 400);
  }

  try {
    const token = body.token || "";
    const resolved = await resolveSubscriptionFromToken(token);

    if (resolved.error === "expired") {
      return jsonError("This edit link has expired. Request a fresh link below.", 410);
    }

    if (resolved.error === "not_found") {
      return jsonError("Subscription not found.", 404);
    }

    if (resolved.error) {
      return jsonError("This edit link is invalid. Request a fresh link below.", 400);
    }

    const subscription = resolved.subscription;

    if (
      subscription.billing?.subscriptionId &&
      !["cancelled", "completed", "expired"].includes(subscription.billing?.status || "")
    ) {
      await cancelRazorpaySubscription({
        subscriptionId: subscription.billing.subscriptionId,
        cancelAtCycleEnd: false,
      });
      subscription.billing.status = "cancelled";
      subscription.billing.cancelledAt = new Date();
      subscription.billing.shortUrl = "";
    }

    subscription.status = "cancelled";
    await subscription.save();

    return NextResponse.json({
      subscription: sanitizeSubscription(subscription),
      message: "Subscription cancelled.",
    });
  } catch (error) {
    console.error(error);
    return jsonError(error.message || "Could not cancel subscription.", 500);
  }
}
