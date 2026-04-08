import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendPreorderConfirmationNotifications } from "@/libs/emailSender";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import Subscription from "@/models/Subscription";
import { verifyRazorpayWebhookSignature } from "@/libs/razorpay";

const getRazorpayOrderIdFromEvent = (event) => {
  return event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id || "";
};

const getRazorpaySubscriptionIdFromEvent = (event) =>
  event?.payload?.subscription?.entity?.id ||
  event?.payload?.payment?.entity?.subscription_id ||
  "";

export async function POST(req) {
  const body = await req.text();
  const signature = headers().get("x-razorpay-signature");

  if (!verifyRazorpayWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid Razorpay webhook signature" }, { status: 400 });
  }

  try {
    await connectMongo();

    const event = JSON.parse(body);
    const razorpaySubscriptionId = getRazorpaySubscriptionIdFromEvent(event);
    const razorpayOrderId = getRazorpayOrderIdFromEvent(event);

    if (razorpaySubscriptionId) {
      const subscription = await Subscription.findOne({
        "billing.subscriptionId": razorpaySubscriptionId,
      });

      if (subscription) {
        const subscriptionEntity = event?.payload?.subscription?.entity || {};
        const paymentEntity = event?.payload?.payment?.entity || {};

        subscription.billing = {
          ...(subscription.billing?.toObject?.() || subscription.billing || {}),
          provider: "razorpay",
          status: subscriptionEntity.status || subscription.billing?.status || "",
          subscriptionId: subscriptionEntity.id || razorpaySubscriptionId,
          planId: subscriptionEntity.plan_id || subscription.billing?.planId || "",
          shortUrl: subscriptionEntity.short_url || subscription.billing?.shortUrl || "",
          amount: subscriptionEntity.plan_id ? subscription.total : subscription.billing?.amount || subscription.total,
          currency: subscription.currency || subscription.billing?.currency || "INR",
          totalCount: subscriptionEntity.total_count || subscription.billing?.totalCount || 0,
          paidCount: subscriptionEntity.paid_count || subscription.billing?.paidCount || 0,
          remainingCount: subscriptionEntity.remaining_count || subscription.billing?.remainingCount || 0,
          authAttempts: subscriptionEntity.auth_attempts || subscription.billing?.authAttempts || 0,
          chargeAt: subscriptionEntity.charge_at
            ? new Date(Number(subscriptionEntity.charge_at) * 1000)
            : subscription.billing?.chargeAt || null,
          startAt: subscriptionEntity.start_at
            ? new Date(Number(subscriptionEntity.start_at) * 1000)
            : subscription.billing?.startAt || null,
          endAt: subscriptionEntity.end_at
            ? new Date(Number(subscriptionEntity.end_at) * 1000)
            : subscription.billing?.endAt || null,
          mandateEndsAt: subscriptionEntity.end_at
            ? new Date(Number(subscriptionEntity.end_at) * 1000)
            : subscription.billing?.mandateEndsAt || null,
          currentStart: subscriptionEntity.current_start
            ? new Date(Number(subscriptionEntity.current_start) * 1000)
            : subscription.billing?.currentStart || null,
          currentEnd: subscriptionEntity.current_end
            ? new Date(Number(subscriptionEntity.current_end) * 1000)
            : subscription.billing?.currentEnd || null,
          lastPaymentId: paymentEntity.id || subscription.billing?.lastPaymentId || "",
          lastPaymentStatus: paymentEntity.status || subscription.billing?.lastPaymentStatus || "",
          authenticatedAt:
            event.event === "subscription.authenticated" ? new Date() : subscription.billing?.authenticatedAt || null,
          activatedAt:
            event.event === "subscription.activated" || event.event === "subscription.charged"
              ? new Date()
              : subscription.billing?.activatedAt || null,
          cancelledAt:
            event.event === "subscription.cancelled" ? new Date() : subscription.billing?.cancelledAt || null,
          completedAt:
            event.event === "subscription.completed" ? new Date() : subscription.billing?.completedAt || null,
          expiredAt:
            event.event === "subscription.expired" ? new Date() : subscription.billing?.expiredAt || null,
        };

        if (event.event === "subscription.cancelled") {
          subscription.billing.shortUrl = "";
          subscription.status = "cancelled";
        }

        if (event.event === "subscription.completed" || event.event === "subscription.expired") {
          subscription.billing.shortUrl = "";
          subscription.status = "cancelled";
        }

        if (event.event === "subscription.activated" || event.event === "subscription.charged") {
          subscription.status = subscription.status === "cancelled" ? subscription.status : "active";
        }

        await subscription.save();
      }
    }

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
        const shouldSendConfirmationNotifications =
          !preorder.notifications?.confirmationEmailSentAt ||
          !preorder.notifications?.confirmationWhatsappSentAt;

        preorder.status =
          preorder.status === "fulfilled" || preorder.status === "shipped"
            ? preorder.status
            : "confirmed";
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

        if (shouldSendConfirmationNotifications) {
          try {
            await sendPreorderConfirmationNotifications({ preorder });
          } catch (notificationError) {
            console.error("Failed to send preorder confirmation notifications", notificationError);
          }
        }

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
