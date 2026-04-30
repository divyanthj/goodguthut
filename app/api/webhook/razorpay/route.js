import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendPreorderConfirmationNotifications } from "@/libs/emailSender";
import { sendOrderPlanConfirmationEmail } from "@/libs/order-plan-notifications";
import { recalculatePreorderWindowRouteSnapshot } from "@/libs/preorder-route-planner";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";
import connectMongo from "@/libs/mongoose";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import Subscription from "@/models/Subscription";
import Sku from "@/models/Sku";
import { cancelRazorpaySubscription, verifyRazorpayWebhookSignature } from "@/libs/razorpay";
import { getNextSubscriptionDeliveryDate } from "@/libs/subscription-schedule";
import { buildSeasonalCutoffMapFromCatalog, getValidRecurringDeliveryCount } from "@/libs/recurring-seasonal-policy";

const getRazorpayOrderIdFromEvent = (event) => {
  return event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id || "";
};

const getRazorpaySubscriptionIdFromEvent = (event) =>
  event?.payload?.subscription?.entity?.id ||
  event?.payload?.payment?.entity?.subscription_id ||
  "";

const TERMINAL_BILLING_STATUSES = new Set(["cancelled", "completed", "expired"]);

const refreshRouteSnapshots = async () => {
  try {
    await recalculateSubscriptionRouteSnapshots();
  } catch (routeError) {
    console.error("Failed to refresh delivery route snapshots", routeError);
  }
};

const applyRecurringNaturalEnd = ({
  planDoc,
  paymentField = "payment",
  seasonalCutoffBySku,
}) => {
  const payment = planDoc?.[paymentField] || {};
  const requestedTotalCount = Math.max(0, Number(payment?.totalCount || 0));
  const paidCount = Math.max(0, Number(payment?.paidCount || 0));

  if (!requestedTotalCount || !planDoc?.startDate || !planDoc?.cadence) {
    return { shouldCancelNow: false };
  }

  const validTotalCount = getValidRecurringDeliveryCount({
    items: planDoc.items || [],
    startDate: planDoc.firstDeliveryDate || planDoc.startDate,
    cadence: planDoc.cadence,
    requestedTotalCount,
    seasonalCutoffBySku,
  });

  const effectiveTotalCount = Math.min(requestedTotalCount, validTotalCount);

  planDoc[paymentField].totalCount = effectiveTotalCount;
  planDoc[paymentField].remainingCount = Math.max(0, effectiveTotalCount - paidCount);
  planDoc.nextDeliveryDate = getNextSubscriptionDeliveryDate({
    startDate: planDoc.firstDeliveryDate || planDoc.startDate,
    cadence: planDoc.cadence,
    paidCount,
    totalCount: effectiveTotalCount,
  });

  return {
    shouldCancelNow:
      requestedTotalCount > effectiveTotalCount &&
      paidCount >= effectiveTotalCount &&
      Boolean(payment?.subscriptionId),
  };
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
    const seasonalCutoffBySku = buildSeasonalCutoffMapFromCatalog(
      await Sku.find({}).select("sku skuType recurringCutoffDate").lean()
    );
    const razorpaySubscriptionId = getRazorpaySubscriptionIdFromEvent(event);
    const razorpayOrderId = getRazorpayOrderIdFromEvent(event);

    if (razorpaySubscriptionId) {
      const orderPlan = await OrderPlan.findOne({
        "payment.subscriptionId": razorpaySubscriptionId,
      });
      if (orderPlan) {
        const subscriptionEntity = event?.payload?.subscription?.entity || {};
        const paymentEntity = event?.payload?.payment?.entity || {};

        orderPlan.payment = {
          ...(orderPlan.payment?.toObject?.() || orderPlan.payment || {}),
          provider: "razorpay",
          status: subscriptionEntity.status || orderPlan.payment?.status || "",
          subscriptionId: subscriptionEntity.id || razorpaySubscriptionId,
          planId: subscriptionEntity.plan_id || orderPlan.payment?.planId || "",
          shortUrl: subscriptionEntity.short_url || orderPlan.payment?.shortUrl || "",
          amount: orderPlan.total,
          currency: orderPlan.currency || orderPlan.payment?.currency || "INR",
          totalCount: subscriptionEntity.total_count || orderPlan.payment?.totalCount || 0,
          paidCount: subscriptionEntity.paid_count || orderPlan.payment?.paidCount || 0,
          remainingCount: subscriptionEntity.remaining_count || orderPlan.payment?.remainingCount || 0,
          authAttempts: subscriptionEntity.auth_attempts || orderPlan.payment?.authAttempts || 0,
          chargeAt: subscriptionEntity.charge_at
            ? new Date(Number(subscriptionEntity.charge_at) * 1000)
            : orderPlan.payment?.chargeAt || null,
          startAt: subscriptionEntity.start_at
            ? new Date(Number(subscriptionEntity.start_at) * 1000)
            : orderPlan.payment?.startAt || null,
          endAt: subscriptionEntity.end_at
            ? new Date(Number(subscriptionEntity.end_at) * 1000)
            : orderPlan.payment?.endAt || null,
          mandateEndsAt: subscriptionEntity.end_at
            ? new Date(Number(subscriptionEntity.end_at) * 1000)
            : orderPlan.payment?.mandateEndsAt || null,
          currentStart: subscriptionEntity.current_start
            ? new Date(Number(subscriptionEntity.current_start) * 1000)
            : orderPlan.payment?.currentStart || null,
          currentEnd: subscriptionEntity.current_end
            ? new Date(Number(subscriptionEntity.current_end) * 1000)
            : orderPlan.payment?.currentEnd || null,
          paymentId: paymentEntity.id || orderPlan.payment?.paymentId || "",
          authenticatedAt:
            event.event === "subscription.authenticated" ? new Date() : orderPlan.payment?.authenticatedAt || null,
          activatedAt:
            event.event === "subscription.activated" || event.event === "subscription.charged"
              ? new Date()
              : orderPlan.payment?.activatedAt || null,
          cancelledAt:
            event.event === "subscription.cancelled" ? new Date() : orderPlan.payment?.cancelledAt || null,
          completedAt:
            event.event === "subscription.completed" ? new Date() : orderPlan.payment?.completedAt || null,
          expiredAt:
            event.event === "subscription.expired" ? new Date() : orderPlan.payment?.expiredAt || null,
        };

        orderPlan.nextDeliveryDate = getNextSubscriptionDeliveryDate({
          startDate: orderPlan.firstDeliveryDate || orderPlan.startDate,
          cadence: orderPlan.cadence,
          paidCount: orderPlan.payment?.paidCount || 0,
          totalCount: orderPlan.payment?.totalCount || 0,
        });

        if (event.event === "subscription.cancelled") {
          orderPlan.payment.shortUrl = "";
          orderPlan.status = "cancelled";
        }

        if (event.event === "subscription.completed" || event.event === "subscription.expired") {
          orderPlan.payment.shortUrl = "";
          orderPlan.status = "cancelled";
        }

        if (event.event === "subscription.activated" || event.event === "subscription.charged") {
          orderPlan.status = orderPlan.status === "cancelled" ? orderPlan.status : "active";
        }

        const { shouldCancelNow } = applyRecurringNaturalEnd({
          planDoc: orderPlan,
          paymentField: "payment",
          seasonalCutoffBySku,
        });

        if (
          shouldCancelNow &&
          !TERMINAL_BILLING_STATUSES.has(String(orderPlan.payment?.status || "").toLowerCase())
        ) {
          try {
            await cancelRazorpaySubscription({
              subscriptionId: orderPlan.payment.subscriptionId,
              cancelAtCycleEnd: false,
            });
          } catch (cancelError) {
            console.error("Failed to cancel invalid recurring order plan mandate", cancelError);
          }

          orderPlan.payment.status = "cancelled";
          orderPlan.payment.cancelledAt = new Date();
          orderPlan.payment.shortUrl = "";
          orderPlan.status = "cancelled";
        }

        await orderPlan.save();
        await refreshRouteSnapshots();
      }

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
        subscription.nextDeliveryDate = getNextSubscriptionDeliveryDate({
          startDate: subscription.firstDeliveryDate || subscription.startDate,
          cadence: subscription.cadence,
          paidCount: subscription.billing?.paidCount || 0,
          totalCount: subscription.billing?.totalCount || 0,
        });

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

        const { shouldCancelNow } = applyRecurringNaturalEnd({
          planDoc: subscription,
          paymentField: "billing",
          seasonalCutoffBySku,
        });

        if (
          shouldCancelNow &&
          !TERMINAL_BILLING_STATUSES.has(String(subscription.billing?.status || "").toLowerCase())
        ) {
          try {
            await cancelRazorpaySubscription({
              subscriptionId: subscription.billing.subscriptionId,
              cancelAtCycleEnd: false,
            });
          } catch (cancelError) {
            console.error("Failed to cancel invalid recurring subscription mandate", cancelError);
          }

          subscription.billing.status = "cancelled";
          subscription.billing.cancelledAt = new Date();
          subscription.billing.shortUrl = "";
          subscription.status = "cancelled";
        }

        await subscription.save();

        await refreshRouteSnapshots();
      }
    }

    if (!razorpayOrderId) {
      return NextResponse.json({ ok: true });
    }

    const orderPlan = await OrderPlan.findOne({ "payment.orderId": razorpayOrderId });
    if (orderPlan) {
      const paymentEntity = event?.payload?.payment?.entity;
      const orderEntity = event?.payload?.order?.entity;

      switch (event.event) {
        case "payment.captured":
        case "order.paid": {
          const shouldSendConfirmationEmail = !orderPlan.notifications?.confirmationEmailSentAt;

          orderPlan.status =
            orderPlan.status === "fulfilled" || orderPlan.status === "cancelled"
              ? orderPlan.status
              : "active";
          orderPlan.payment = {
            ...(orderPlan.payment?.toObject?.() || orderPlan.payment || {}),
            provider: "razorpay",
            status: "paid",
            orderId: paymentEntity?.order_id || orderEntity?.id || orderPlan.payment?.orderId || "",
            paymentId: paymentEntity?.id || orderPlan.payment?.paymentId || "",
            signature: signature || "",
            webhookEvent: event.event,
            amount: paymentEntity?.amount ? Number(paymentEntity.amount) / 100 : orderPlan.total,
            currency: paymentEntity?.currency || orderEntity?.currency || orderPlan.currency,
            paidAt: paymentEntity?.captured_at
              ? new Date(Number(paymentEntity.captured_at) * 1000)
              : new Date(),
          };
          await orderPlan.save();
          await refreshRouteSnapshots();

          if (shouldSendConfirmationEmail) {
            try {
              await sendOrderPlanConfirmationEmail({ orderPlan });
              orderPlan.notifications = {
                ...(orderPlan.notifications?.toObject?.() || orderPlan.notifications || {}),
                confirmationEmailSentAt: new Date(),
              };
              await orderPlan.save();
            } catch (notificationError) {
              console.error("Failed to send order plan confirmation email", notificationError);
            }
          }

          break;
        }
        case "payment.failed": {
          orderPlan.payment = {
            ...(orderPlan.payment?.toObject?.() || orderPlan.payment || {}),
            provider: "razorpay",
            status: "failed",
            paymentId: paymentEntity?.id || orderPlan.payment?.paymentId || "",
            webhookEvent: event.event,
          };
          if (orderPlan.status !== "cancelled" && orderPlan.status !== "fulfilled") {
            orderPlan.status = "failed";
          }
          await orderPlan.save();
          await refreshRouteSnapshots();
          break;
        }
        default:
          break;
      }
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

        if (preorder.preorderWindow) {
          try {
            await recalculatePreorderWindowRouteSnapshot({
              preorderWindowId: preorder.preorderWindow,
            });
          } catch (routeError) {
            console.error("Failed to refresh preorder delivery route snapshot", routeError);
          }
        }

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

        if (preorder.preorderWindow) {
          try {
            await recalculatePreorderWindowRouteSnapshot({
              preorderWindowId: preorder.preorderWindow,
            });
          } catch (routeError) {
            console.error("Failed to refresh preorder delivery route snapshot", routeError);
          }
        }
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
