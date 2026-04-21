import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { sendOrderPlanConfirmationEmail } from "@/libs/order-plan-notifications";
import Sku from "@/models/Sku";
import {
  extractRazorpayPaymentResult,
  extractRazorpaySubscriptionResult,
  fetchRazorpayPayment,
  fetchRazorpaySubscription,
  getRazorpayPaymentVerificationError,
  verifyRazorpayPaymentSignature,
  verifyRazorpayPaymentWithApi,
  verifyRazorpaySubscriptionCustomer,
  verifyRazorpaySubscriptionSignature,
  verifySignedCheckoutToken,
} from "@/libs/razorpay";
import { formatSubscriptionDate, getNextSubscriptionDeliveryDate } from "@/libs/subscription-schedule";
import { buildSeasonalCutoffMapFromCatalog, getValidRecurringDeliveryCount } from "@/libs/recurring-seasonal-policy";
import OrderPlan from "@/models/OrderPlan";

const sanitizeOrderPlan = (orderPlan) => JSON.parse(JSON.stringify(orderPlan));

const syncRecurringOrderPlanPayment = async ({
  orderPlan,
  razorpaySubscription,
  seasonalCutoffBySku,
  paymentId = "",
}) => {
  const payment = paymentId ? await fetchRazorpayPayment(paymentId) : null;
  const effectiveStatus =
    razorpaySubscription.status === "created" && paymentId
      ? "authenticated"
      : razorpaySubscription.status || orderPlan.payment?.status || "created";

  orderPlan.payment = {
    ...(orderPlan.payment?.toObject?.() || orderPlan.payment || {}),
    provider: "razorpay",
    status: effectiveStatus,
    subscriptionId: razorpaySubscription.id || orderPlan.payment?.subscriptionId || "",
    planId: razorpaySubscription.plan_id || orderPlan.payment?.planId || "",
    shortUrl:
      ["authenticated", "active", "completed", "cancelled", "expired"].includes(
        effectiveStatus
      )
        ? ""
        : razorpaySubscription.short_url || orderPlan.payment?.shortUrl || "",
    amount: orderPlan.total,
    currency: orderPlan.currency || razorpaySubscription?.currency || "INR",
    totalCount: razorpaySubscription.total_count || orderPlan.payment?.totalCount || 0,
    paidCount: razorpaySubscription.paid_count || orderPlan.payment?.paidCount || 0,
    remainingCount: razorpaySubscription.remaining_count || orderPlan.payment?.remainingCount || 0,
    authAttempts: razorpaySubscription.auth_attempts || orderPlan.payment?.authAttempts || 0,
    chargeAt: razorpaySubscription.charge_at
      ? new Date(Number(razorpaySubscription.charge_at) * 1000)
      : orderPlan.payment?.chargeAt || null,
    startAt: razorpaySubscription.start_at
      ? new Date(Number(razorpaySubscription.start_at) * 1000)
      : orderPlan.payment?.startAt || null,
    endAt: razorpaySubscription.end_at
      ? new Date(Number(razorpaySubscription.end_at) * 1000)
      : orderPlan.payment?.endAt || null,
    mandateEndsAt: razorpaySubscription.end_at
      ? new Date(Number(razorpaySubscription.end_at) * 1000)
      : orderPlan.payment?.mandateEndsAt || null,
    currentStart: razorpaySubscription.current_start
      ? new Date(Number(razorpaySubscription.current_start) * 1000)
      : orderPlan.payment?.currentStart || null,
    currentEnd: razorpaySubscription.current_end
      ? new Date(Number(razorpaySubscription.current_end) * 1000)
      : orderPlan.payment?.currentEnd || null,
    paymentId: payment?.id || paymentId || orderPlan.payment?.paymentId || "",
    paidAt:
      payment?.captured_at || payment?.created_at
        ? new Date(Number(payment?.captured_at || payment?.created_at) * 1000)
        : orderPlan.payment?.paidAt || null,
    authenticatedAt:
      effectiveStatus === "authenticated"
        ? orderPlan.payment?.authenticatedAt || new Date()
        : orderPlan.payment?.authenticatedAt || null,
    activatedAt:
      effectiveStatus === "active"
        ? orderPlan.payment?.activatedAt || new Date()
        : orderPlan.payment?.activatedAt || null,
    cancelledAt:
      effectiveStatus === "cancelled"
        ? orderPlan.payment?.cancelledAt || new Date()
        : orderPlan.payment?.cancelledAt || null,
    completedAt:
      effectiveStatus === "completed"
        ? orderPlan.payment?.completedAt || new Date()
        : orderPlan.payment?.completedAt || null,
    expiredAt:
      effectiveStatus === "expired"
        ? orderPlan.payment?.expiredAt || new Date()
        : orderPlan.payment?.expiredAt || null,
  };
  const requestedTotalCount = Math.max(0, Number(orderPlan.payment?.totalCount || 0));
  const effectiveTotalCount = requestedTotalCount
    ? Math.min(
        requestedTotalCount,
        getValidRecurringDeliveryCount({
          items: orderPlan.items || [],
          startDate: orderPlan.firstDeliveryDate || orderPlan.startDate,
          cadence: orderPlan.cadence,
          requestedTotalCount,
          seasonalCutoffBySku,
        })
      )
    : 0;

  orderPlan.payment.totalCount = effectiveTotalCount;
  orderPlan.payment.remainingCount = Math.max(
    0,
    effectiveTotalCount - Math.max(0, Number(orderPlan.payment?.paidCount || 0))
  );

  orderPlan.nextDeliveryDate = getNextSubscriptionDeliveryDate({
    startDate: orderPlan.firstDeliveryDate || orderPlan.startDate,
    cadence: orderPlan.cadence,
    paidCount: orderPlan.payment?.paidCount || 0,
    totalCount: effectiveTotalCount,
  });

  if (["authenticated", "active"].includes(effectiveStatus)) {
    orderPlan.status = orderPlan.status === "cancelled" ? "cancelled" : "active";
  }
};

export async function PATCH(req) {
  try {
    await connectMongo();
    const seasonalCutoffBySku = buildSeasonalCutoffMapFromCatalog(
      await Sku.find({}).select("sku skuType recurringCutoffDate").lean()
    );

    const body = await req.json();
    const checkoutToken = body.checkoutToken || "";
    const checkoutSession = verifySignedCheckoutToken(checkoutToken);

    if (!checkoutSession || !String(checkoutSession.kind || "").startsWith("order_plan_")) {
      return NextResponse.json(
        { error: "This payment session has expired. Please try again." },
        { status: 400 }
      );
    }

    const orderPlan = await OrderPlan.findById(checkoutSession.orderPlanId);

    if (!orderPlan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (orderPlan.mode === "one_time") {
      if (orderPlan.payment?.status === "paid") {
        return NextResponse.json({
          orderPlan: sanitizeOrderPlan(orderPlan),
          confirmationMessage: "Payment received. Your one-time order is confirmed.",
        });
      }

      const { orderId: callbackOrderId, paymentId, signature } = extractRazorpayPaymentResult(body);
      const expectedOrderId =
        callbackOrderId || checkoutSession.razorpayOrderId || orderPlan.payment?.orderId || "";
      const hasValidSignature = verifyRazorpayPaymentSignature({
        orderId: expectedOrderId,
        paymentId,
        signature,
      });

      let verifiedOrderId = expectedOrderId;

      if (!hasValidSignature) {
        const paymentCheck = await verifyRazorpayPaymentWithApi({
          orderId: expectedOrderId,
          paymentId,
          expectedAmount: Math.round(Number(orderPlan.total || orderPlan.payment?.amount || 0) * 100),
          expectedCurrency: orderPlan.currency || "INR",
          expectedPhone: orderPlan.phone || "",
        });

        if (!paymentCheck.ok) {
          return NextResponse.json(
            {
              error: getRazorpayPaymentVerificationError({
                orderId: expectedOrderId,
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

      orderPlan.status = orderPlan.status === "cancelled" ? "cancelled" : "active";
      orderPlan.payment = {
        ...(orderPlan.payment?.toObject?.() || orderPlan.payment || {}),
        provider: "razorpay",
        status: "paid",
        amount: Number(orderPlan.total || orderPlan.payment?.amount || 0),
        currency: orderPlan.currency || orderPlan.payment?.currency || "INR",
        orderId: verifiedOrderId || orderPlan.payment?.orderId || "",
        paymentId,
        signature,
        paidAt: new Date(),
      };
      await orderPlan.save();

      if (!orderPlan.notifications?.confirmationEmailSentAt) {
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

      return NextResponse.json({
        orderPlan: sanitizeOrderPlan(orderPlan),
        confirmationMessage: "Payment received. Your one-time order is confirmed.",
      });
    }

    const { subscriptionId: callbackSubscriptionId, paymentId, signature } =
      extractRazorpaySubscriptionResult(body);
    const razorpaySubscriptionId =
      callbackSubscriptionId ||
      checkoutSession.razorpaySubscriptionId ||
      orderPlan.payment?.subscriptionId ||
      "";

    if (
      !razorpaySubscriptionId ||
      razorpaySubscriptionId !== orderPlan.payment?.subscriptionId
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
      expectedEmail: orderPlan.email,
      expectedPhone: orderPlan.phone,
    });

    if (!customerCheck.ok) {
      return NextResponse.json(
        {
          error:
            customerCheck.reason === "email_mismatch"
              ? "Payment verification failed because the Razorpay payment email did not match your email."
              : customerCheck.reason === "phone_mismatch"
                ? "Payment verification failed because the Razorpay payment phone number did not match your phone."
                : "Payment verification failed because the Razorpay payment details could not be verified.",
        },
        { status: 400 }
      );
    }

    await syncRecurringOrderPlanPayment({
      orderPlan,
      razorpaySubscription,
      seasonalCutoffBySku,
      paymentId,
    });
    await orderPlan.save();

    if (!orderPlan.notifications?.confirmationEmailSentAt) {
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

    return NextResponse.json({
      orderPlan: sanitizeOrderPlan(orderPlan),
      confirmationMessage:
        orderPlan.payment?.status === "active"
          ? `Recurring payment is active and your plan is confirmed. Your first delivery is on ${formatSubscriptionDate(orderPlan.firstDeliveryDate || orderPlan.startDate)}.`
          : orderPlan.payment?.status === "authenticated"
            ? `Auto-pay is confirmed and your first delivery is set for ${formatSubscriptionDate(orderPlan.firstDeliveryDate || orderPlan.startDate)}.`
            : "Payment setup was received and your plan is being synced.",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not verify payment." },
      { status: 500 }
    );
  }
}
