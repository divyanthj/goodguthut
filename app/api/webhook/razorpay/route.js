import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  sendAdminOrderPlanConfirmedEmail,
  sendAdminPreorderConfirmedEmail,
} from "@/libs/admin-order-notifications";
import { sendPreorderConfirmationNotifications } from "@/libs/emailSender";
import { sendOrderPlanConfirmationEmail } from "@/libs/order-plan-notifications";
import { recalculatePreorderWindowRouteSnapshot } from "@/libs/preorder-route-planner";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";
import connectMongo from "@/libs/mongoose";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import Subscription from "@/models/Subscription";
import Sku from "@/models/Sku";
import {
  cancelRazorpaySubscription,
  fetchRazorpayOrderPayments,
  verifyRazorpayWebhookSignature,
} from "@/libs/razorpay";
import { buildSeasonalCutoffMapFromCatalog, getValidRecurringDeliveryCount } from "@/libs/recurring-seasonal-policy";

const getRazorpayOrderIdFromEvent = (event) => {
  return event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id || "";
};

const getRazorpayPaymentLinkIdFromEvent = (event) =>
  event?.payload?.payment_link?.entity?.id ||
  event?.payload?.payment?.entity?.notes?.paymentLinkId ||
  event?.payload?.payment?.entity?.notes?.payment_link_id ||
  "";

const getRazorpaySubscriptionIdFromEvent = (event) =>
  event?.payload?.subscription?.entity?.id ||
  event?.payload?.payment?.entity?.subscription_id ||
  "";

const getPaymentNotesFromEvent = (event) => {
  const notes = event?.payload?.payment?.entity?.notes;

  return notes && typeof notes === "object" ? notes : {};
};

const TERMINAL_BILLING_STATUSES = new Set(["cancelled", "completed", "expired"]);

const refreshRouteSnapshots = async () => {
  try {
    await recalculateSubscriptionRouteSnapshots();
  } catch (routeError) {
    console.error("Failed to refresh delivery route snapshots", routeError);
  }
};

const getCapturedPaymentForOrder = async (orderId = "") => {
  try {
    const payments = await fetchRazorpayOrderPayments(orderId);

    return payments.find(
      (payment) =>
        payment?.status === "captured" ||
        payment?.captured === true
    ) || null;
  } catch (error) {
    console.error("Failed to check Razorpay order payments", error);
    return null;
  }
};

const findOrderPlanForPaymentEvent = async ({
  razorpayOrderId = "",
  razorpayPaymentLinkId = "",
  paymentNotes = {},
}) => {
  const orderPlanId = String(paymentNotes.orderPlanId || "").trim();

  if (orderPlanId) {
    const orderPlan = await OrderPlan.findById(orderPlanId);

    if (orderPlan) {
      return orderPlan;
    }
  }

  const query = [];
  const notedOrderId = String(paymentNotes.razorpayOrderId || "").trim();

  if (razorpayOrderId) {
    query.push({ "payment.orderId": razorpayOrderId });
  }

  if (notedOrderId) {
    query.push({ "payment.orderId": notedOrderId });
  }

  if (razorpayPaymentLinkId) {
    query.push({ "payment.paymentLinkId": razorpayPaymentLinkId });
  }

  return query.length > 0 ? OrderPlan.findOne({ $or: query }) : null;
};

const findPreorderForPaymentEvent = async ({
  razorpayOrderId = "",
  razorpayPaymentLinkId = "",
  paymentNotes = {},
}) => {
  const preorderId = String(paymentNotes.preorderId || "").trim();

  if (preorderId) {
    const preorder = await Preorder.findById(preorderId);

    if (preorder) {
      return preorder;
    }
  }

  const query = [];
  const notedOrderId = String(paymentNotes.razorpayOrderId || "").trim();

  if (razorpayOrderId) {
    query.push({ "payment.orderId": razorpayOrderId });
  }

  if (notedOrderId) {
    query.push({ "payment.orderId": notedOrderId });
  }

  if (razorpayPaymentLinkId) {
    query.push({ "payment.paymentLinkId": razorpayPaymentLinkId });
  }

  return query.length > 0 ? Preorder.findOne({ $or: query }) : null;
};

const applyCapturedOrderPlanPayment = ({ orderPlan, payment, orderEntity, signature, eventName }) => {
  orderPlan.status =
    orderPlan.status === "fulfilled" || orderPlan.status === "cancelled"
      ? orderPlan.status
      : "active";
  orderPlan.payment = {
    ...(orderPlan.payment?.toObject?.() || orderPlan.payment || {}),
    provider: "razorpay",
    status: "paid",
    orderId: payment?.order_id || orderEntity?.id || orderPlan.payment?.orderId || "",
    paymentId: payment?.id || orderPlan.payment?.paymentId || "",
    signature: signature || orderPlan.payment?.signature || "",
    webhookEvent: eventName,
    amount: payment?.amount ? Number(payment.amount) / 100 : orderPlan.total,
    currency: payment?.currency || orderEntity?.currency || orderPlan.currency,
    paidAt: payment?.captured_at
      ? new Date(Number(payment.captured_at) * 1000)
      : payment?.created_at
        ? new Date(Number(payment.created_at) * 1000)
        : new Date(),
  };
};

const applyCapturedPreorderPayment = ({ preorder, payment, orderEntity, signature, eventName }) => {
  preorder.status =
    preorder.status === "fulfilled" || preorder.status === "shipped"
      ? preorder.status
      : "confirmed";
  preorder.payment = {
    ...(preorder.payment?.toObject?.() || preorder.payment || {}),
    provider: "razorpay",
    status: "paid",
    orderId: payment?.order_id || orderEntity?.id || preorder.payment?.orderId || "",
    paymentId: payment?.id || preorder.payment?.paymentId || "",
    signature: signature || preorder.payment?.signature || "",
    webhookEvent: eventName,
    amount: payment?.amount ? Number(payment.amount) / 100 : preorder.total,
    currency: payment?.currency || orderEntity?.currency || preorder.currency,
    paidAt: payment?.captured_at
      ? new Date(Number(payment.captured_at) * 1000)
      : payment?.created_at
        ? new Date(Number(payment.created_at) * 1000)
        : new Date(),
  };
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

  return {
    shouldCancelNow:
      requestedTotalCount > effectiveTotalCount &&
      paidCount >= effectiveTotalCount &&
      Boolean(payment?.subscriptionId),
  };
};

const getSubscriptionStatusFromEvent = ({
  eventName = "",
  subscriptionEntity = {},
  fallbackStatus = "",
}) => {
  const entityStatus = String(subscriptionEntity.status || "").trim();

  if (eventName === "subscription.resumed") {
    return entityStatus && entityStatus !== "resumed" ? entityStatus : "active";
  }

  if (entityStatus) {
    return entityStatus;
  }

  switch (eventName) {
    case "subscription.authenticated":
      return "authenticated";
    case "subscription.activated":
    case "subscription.charged":
      return "active";
    case "subscription.paused":
      return "paused";
    case "subscription.pending":
      return "pending";
    case "subscription.halted":
      return "halted";
    case "subscription.cancelled":
      return "cancelled";
    case "subscription.completed":
      return "completed";
    case "subscription.expired":
      return "expired";
    default:
      return fallbackStatus;
  }
};

const applyOrderPlanSubscriptionEventStatus = (orderPlan, eventName = "") => {
  if (["cancelled", "fulfilled"].includes(orderPlan.status)) {
    return;
  }

  switch (eventName) {
    case "subscription.authenticated":
    case "subscription.pending":
      orderPlan.status = "payment_pending";
      break;
    case "subscription.paused":
    case "subscription.halted":
      orderPlan.status = "paused";
      break;
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
    case "subscription.completed":
      orderPlan.status = orderPlan.status === "shipped" ? "shipped" : "active";
      break;
    case "subscription.cancelled":
    case "subscription.expired":
      orderPlan.status = "cancelled";
      break;
    default:
      break;
  }
};

const applySubscriptionEventStatus = (subscription, eventName = "") => {
  if (subscription.status === "cancelled") {
    return;
  }

  switch (eventName) {
    case "subscription.authenticated":
    case "subscription.pending":
      subscription.status = "new";
      break;
    case "subscription.paused":
    case "subscription.halted":
      subscription.status = "paused";
      break;
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
    case "subscription.completed":
      subscription.status = "active";
      break;
    case "subscription.cancelled":
    case "subscription.expired":
      subscription.status = "cancelled";
      break;
    default:
      break;
  }
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
    const razorpayPaymentLinkId = getRazorpayPaymentLinkIdFromEvent(event);
    const paymentNotes = getPaymentNotesFromEvent(event);

    if (razorpaySubscriptionId) {
      const orderPlan = await OrderPlan.findOne({
        "payment.subscriptionId": razorpaySubscriptionId,
      });
      if (orderPlan) {
        const subscriptionEntity = event?.payload?.subscription?.entity || {};
        const paymentEntity = event?.payload?.payment?.entity || {};
        const nextPaymentStatus = getSubscriptionStatusFromEvent({
          eventName: event.event,
          subscriptionEntity,
          fallbackStatus: orderPlan.payment?.status || "",
        });

        orderPlan.payment = {
          ...(orderPlan.payment?.toObject?.() || orderPlan.payment || {}),
          provider: "razorpay",
          status: nextPaymentStatus,
          subscriptionId: subscriptionEntity.id || razorpaySubscriptionId,
          planId: subscriptionEntity.plan_id || orderPlan.payment?.planId || "",
          shortUrl: subscriptionEntity.short_url || orderPlan.payment?.shortUrl || "",
          webhookEvent: event.event,
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

        if (!orderPlan.nextDeliveryDate && orderPlan.firstDeliveryDate) {
          orderPlan.nextDeliveryDate = orderPlan.firstDeliveryDate;
        }

        if (event.event === "subscription.cancelled") {
          orderPlan.payment.shortUrl = "";
        }

        if (event.event === "subscription.expired") {
          orderPlan.payment.shortUrl = "";
        }

        if (
          event.event === "subscription.activated" ||
          event.event === "subscription.charged" ||
          event.event === "subscription.resumed" ||
          event.event === "subscription.completed"
        ) {
          orderPlan.payment.shortUrl = "";
        }

        applyOrderPlanSubscriptionEventStatus(orderPlan, event.event);

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
        const nextBillingStatus = getSubscriptionStatusFromEvent({
          eventName: event.event,
          subscriptionEntity,
          fallbackStatus: subscription.billing?.status || "",
        });

        subscription.billing = {
          ...(subscription.billing?.toObject?.() || subscription.billing || {}),
          provider: "razorpay",
          status: nextBillingStatus,
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
        if (!subscription.nextDeliveryDate && subscription.firstDeliveryDate) {
          subscription.nextDeliveryDate = subscription.firstDeliveryDate;
        }

        if (event.event === "subscription.cancelled") {
          subscription.billing.shortUrl = "";
        }

        if (event.event === "subscription.expired") {
          subscription.billing.shortUrl = "";
        }

        if (
          event.event === "subscription.activated" ||
          event.event === "subscription.charged" ||
          event.event === "subscription.resumed" ||
          event.event === "subscription.completed"
        ) {
          subscription.billing.shortUrl = "";
        }

        applySubscriptionEventStatus(subscription, event.event);

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

    if (razorpayPaymentLinkId && event.event === "payment_link.paid") {
      const paymentEntity = event?.payload?.payment?.entity || {};
      const paymentLinkEntity = event?.payload?.payment_link?.entity || {};
      const orderPlan = await findOrderPlanForPaymentEvent({
        razorpayOrderId,
        razorpayPaymentLinkId,
        paymentNotes,
      });

      if (orderPlan) {
        const shouldSendConfirmationEmail = !orderPlan.notifications?.confirmationEmailSentAt;
        const shouldSendAdminOrderEmail = !orderPlan.notifications?.adminOrderEmailSentAt;

        applyCapturedOrderPlanPayment({
          orderPlan,
          payment: {
            ...paymentEntity,
            amount: paymentEntity.amount || paymentLinkEntity.amount,
            currency: paymentEntity.currency || paymentLinkEntity.currency,
          },
          orderEntity: null,
          signature,
          eventName: event.event,
        });
        orderPlan.payment.paymentLinkId = razorpayPaymentLinkId;
        orderPlan.payment.shortUrl = "";
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

        if (shouldSendAdminOrderEmail) {
          try {
            await sendAdminOrderPlanConfirmedEmail({ orderPlan });
            orderPlan.notifications = {
              ...(orderPlan.notifications?.toObject?.() || orderPlan.notifications || {}),
              adminOrderEmailSentAt: new Date(),
            };
            await orderPlan.save();
          } catch (notificationError) {
            console.error("Failed to send admin order plan confirmation email", notificationError);
          }
        }

        return NextResponse.json({ ok: true });
      }

      const preorder = await findPreorderForPaymentEvent({
        razorpayOrderId,
        razorpayPaymentLinkId,
        paymentNotes,
      });

      if (preorder) {
        const shouldSendConfirmationNotifications =
          !preorder.notifications?.confirmationEmailSentAt ||
          !preorder.notifications?.confirmationWhatsappSentAt;
        const shouldSendAdminOrderEmail = !preorder.notifications?.adminOrderEmailSentAt;

        applyCapturedPreorderPayment({
          preorder,
          payment: {
            ...paymentEntity,
            amount: paymentEntity.amount || paymentLinkEntity.amount,
            currency: paymentEntity.currency || paymentLinkEntity.currency,
          },
          orderEntity: null,
          signature,
          eventName: event.event,
        });
        preorder.payment.paymentLinkId = razorpayPaymentLinkId;
        preorder.payment.shortUrl = "";
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

        if (shouldSendAdminOrderEmail) {
          try {
            await sendAdminPreorderConfirmedEmail({ preorder });
            preorder.notifications = {
              ...(preorder.notifications?.toObject?.() || preorder.notifications || {}),
              adminOrderEmailSentAt: new Date(),
            };
            await preorder.save();
          } catch (notificationError) {
            console.error("Failed to send admin preorder confirmation email", notificationError);
          }
        }

        return NextResponse.json({ ok: true });
      }
    }

    if (
      !razorpayOrderId &&
      !razorpayPaymentLinkId &&
      !paymentNotes.orderPlanId &&
      !paymentNotes.preorderId &&
      !paymentNotes.razorpayOrderId
    ) {
      return NextResponse.json({ ok: true });
    }

    const orderPlan = await findOrderPlanForPaymentEvent({
      razorpayOrderId,
      razorpayPaymentLinkId,
      paymentNotes,
    });
    if (orderPlan) {
      const paymentEntity = event?.payload?.payment?.entity;
      const orderEntity = event?.payload?.order?.entity;

      switch (event.event) {
        case "payment.captured":
        case "order.paid": {
          const shouldSendConfirmationEmail = !orderPlan.notifications?.confirmationEmailSentAt;
          const shouldSendAdminOrderEmail = !orderPlan.notifications?.adminOrderEmailSentAt;

          applyCapturedOrderPlanPayment({
            orderPlan,
            payment: paymentEntity,
            orderEntity,
            signature,
            eventName: event.event,
          });
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

          if (shouldSendAdminOrderEmail) {
            try {
              await sendAdminOrderPlanConfirmedEmail({ orderPlan });
              orderPlan.notifications = {
                ...(orderPlan.notifications?.toObject?.() || orderPlan.notifications || {}),
                adminOrderEmailSentAt: new Date(),
              };
              await orderPlan.save();
            } catch (notificationError) {
              console.error("Failed to send admin order plan confirmation email", notificationError);
            }
          }

          break;
        }
        case "payment.failed": {
          if (orderPlan.payment?.status === "paid") {
            break;
          }

          const capturedPayment = await getCapturedPaymentForOrder(razorpayOrderId);

          if (capturedPayment) {
            applyCapturedOrderPlanPayment({
              orderPlan,
              payment: capturedPayment,
              orderEntity,
              signature,
              eventName: "payment.captured",
            });
            await orderPlan.save();
            await refreshRouteSnapshots();
            break;
          }

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

    const preorder = await findPreorderForPaymentEvent({
      razorpayOrderId,
      razorpayPaymentLinkId,
      paymentNotes,
    });

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
        const shouldSendAdminOrderEmail = !preorder.notifications?.adminOrderEmailSentAt;

        applyCapturedPreorderPayment({
          preorder,
          payment: paymentEntity,
          orderEntity,
          signature,
          eventName: event.event,
        });
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

        if (shouldSendAdminOrderEmail) {
          try {
            await sendAdminPreorderConfirmedEmail({ preorder });
            preorder.notifications = {
              ...(preorder.notifications?.toObject?.() || preorder.notifications || {}),
              adminOrderEmailSentAt: new Date(),
            };
            await preorder.save();
          } catch (notificationError) {
            console.error("Failed to send admin preorder confirmation email", notificationError);
          }
        }

        break;
      }
      case "payment.failed": {
        if (preorder.payment?.status === "paid") {
          break;
        }

        const capturedPayment = await getCapturedPaymentForOrder(razorpayOrderId);

        if (capturedPayment) {
          applyCapturedPreorderPayment({
            preorder,
            payment: capturedPayment,
            orderEntity,
            signature,
            eventName: "payment.captured",
          });
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
