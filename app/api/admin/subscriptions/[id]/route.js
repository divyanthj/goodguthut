import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import Subscription from "@/models/Subscription";
import { assertValidSubscriptionStatus } from "@/libs/subscriptions";
import {
  cancelRazorpaySubscription,
  pauseRazorpaySubscription,
  resumeRazorpaySubscription,
} from "@/libs/razorpay";

const sanitizeSubscription = (subscription) =>
  JSON.parse(JSON.stringify(subscription));

const ensureAdmin = async () => {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
};

export async function PATCH(req, { params }) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  await connectMongo();

  try {
    const subscription = await Subscription.findById(params.id);

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }

    const body = await req.json();

    if (body.status) {
      const previousStatus = subscription.status;
      const previousBillingStatus = subscription.billing?.status || "";
      assertValidSubscriptionStatus(body.status);

      if (subscription.billing?.subscriptionId) {
        if (body.status === "cancelled" && !["cancelled", "completed", "expired"].includes(previousBillingStatus)) {
          await cancelRazorpaySubscription({
            subscriptionId: subscription.billing.subscriptionId,
            cancelAtCycleEnd: false,
          });
          subscription.billing.status = "cancelled";
          subscription.billing.cancelledAt = new Date();
          subscription.billing.shortUrl = "";
        } else if (body.status === "paused" && previousBillingStatus === "active") {
          await pauseRazorpaySubscription({
            subscriptionId: subscription.billing.subscriptionId,
            pauseAt: "now",
          });
          subscription.billing.status = "paused";
        } else if (
          body.status === "active" &&
          previousStatus === "paused" &&
          previousBillingStatus === "paused"
        ) {
          await resumeRazorpaySubscription({
            subscriptionId: subscription.billing.subscriptionId,
            resumeAt: "now",
          });
          subscription.billing.status = "active";
        }
      }

      subscription.status = body.status;

      if (body.status === "contacted" || body.status === "trial_scheduled" || body.status === "active") {
        subscription.lastContactedAt = new Date();
      }
    }

    await subscription.save();

    return NextResponse.json({ subscription: sanitizeSubscription(subscription) });
  } catch (error) {
    console.error(error);

    if (error.message === "Invalid subscription status.") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  await connectMongo();

  try {
    const subscription = await Subscription.findById(params.id);

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }

    if (
      subscription.billing?.subscriptionId &&
      !["cancelled", "completed", "expired"].includes(subscription.billing?.status || "")
    ) {
      await cancelRazorpaySubscription({
        subscriptionId: subscription.billing.subscriptionId,
        cancelAtCycleEnd: false,
      });
    }

    await Subscription.findByIdAndDelete(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
