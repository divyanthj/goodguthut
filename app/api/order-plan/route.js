import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { buildOrderPlanRequest } from "@/libs/order-plan-request";
import { sendOrderPlanConfirmationEmail } from "@/libs/order-plan-notifications";
import {
  createRazorpayOrder,
  createRazorpayPlan,
  createRazorpaySubscription,
  createSignedCheckoutToken,
  getRazorpayPublicConfig,
  isRazorpayConfigured,
} from "@/libs/razorpay";
import {
  enforceBrowserOrigin,
  jsonError,
  logAbuseEvent,
  readJsonBody,
} from "@/libs/request-protection";
import {
  formatSubscriptionDate,
  getNextSubscriptionDeliveryDate,
  parseDateKeyToIstDate,
} from "@/libs/subscription-schedule";
import { getSubscriptionDurationConfig } from "@/libs/subscriptions";
import { RECURRING_SEASONAL_FULL_PERIOD_ERROR } from "@/libs/recurring-seasonal-policy";
import OrderPlan from "@/models/OrderPlan";

const buildLineupSummary = (items = []) =>
  items.map((item) => `${item.productName} x ${item.quantity}`).join(", ");

const serializeOrderPlan = (orderPlan) => JSON.parse(JSON.stringify(orderPlan));

const buildOrderPlanCheckoutPayload = ({ orderPlan, mode, razorpayOrder, razorpaySubscription }) => {
  if (mode === "one_time" && razorpayOrder) {
    const checkoutToken = createSignedCheckoutToken({
      kind: "order_plan_one_time",
      orderPlanId: orderPlan.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      email: orderPlan.email || "",
      phone: orderPlan.phone || "",
    });

    return {
      checkoutToken,
      razorpay: {
        ...getRazorpayPublicConfig(),
        order_id: razorpayOrder.id,
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "Good Gut Hut",
        description: "One-time order payment",
        prefill: {
          name: orderPlan.name,
          email: orderPlan.email,
          contact: orderPlan.phone,
        },
      },
    };
  }

  if (mode === "recurring" && razorpaySubscription) {
    const checkoutToken = createSignedCheckoutToken({
      kind: "order_plan_recurring",
      orderPlanId: orderPlan.id,
      razorpaySubscriptionId: razorpaySubscription.id,
      amount: Math.round(Number(orderPlan.total || 0) * 100),
      currency: orderPlan.currency || "INR",
      email: orderPlan.email || "",
      phone: orderPlan.phone || "",
    });

    return {
      checkoutToken,
      razorpay: {
        ...getRazorpayPublicConfig(),
        subscription_id: razorpaySubscription.id,
        subscriptionId: razorpaySubscription.id,
        amount: Math.round(Number(orderPlan.total || 0) * 100),
        currency: orderPlan.currency || "INR",
        name: "Good Gut Hut",
        description: `Set up recurring auto-pay starting ${formatSubscriptionDate(orderPlan.firstDeliveryDate)}`,
        prefill: {
          name: orderPlan.name,
          email: orderPlan.email,
          contact: orderPlan.phone,
        },
      },
    };
  }

  return null;
};

export async function POST(req) {
  const originError = enforceBrowserOrigin(req);

  if (originError) {
    return originError;
  }

  let body;

  try {
    body = await readJsonBody(req, { maxBytes: 24 * 1024 });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("order-plan-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    logAbuseEvent("order-plan-invalid-json", req);
    return jsonError("Request body must be valid JSON.", 400);
  }

  try {
    const orderPlanRequest = await buildOrderPlanRequest(body);
    await connectMongo();

    const orderPlan = await OrderPlan.create({
      mode: orderPlanRequest.mode,
      paymentType: orderPlanRequest.paymentType,
      name: orderPlanRequest.name,
      phone: orderPlanRequest.phone,
      email: orderPlanRequest.email,
      address: orderPlanRequest.address,
      deliveryPlaceId: orderPlanRequest.deliveryPlaceId,
      normalizedDeliveryAddress: orderPlanRequest.normalizedDeliveryAddress,
      cadence: orderPlanRequest.cadence || "",
      durationWeeks: orderPlanRequest.durationWeeks || 0,
      selectionMode: orderPlanRequest.selectionMode,
      comboId: orderPlanRequest.comboId,
      comboName: orderPlanRequest.comboName,
      deliveryDaysOfWeek: orderPlanRequest.deliveryDaysOfWeek,
      minimumLeadDays: orderPlanRequest.minimumLeadDays,
      startDate: orderPlanRequest.startDate,
      firstDeliveryDate: orderPlanRequest.firstDeliveryDate,
      nextDeliveryDate: orderPlanRequest.nextDeliveryDate,
      currency: orderPlanRequest.currency,
      items: orderPlanRequest.items,
      totalQuantity: orderPlanRequest.totalQuantity,
      subtotal: orderPlanRequest.subtotal,
      deliveryFee: orderPlanRequest.deliveryFee,
      deliveryDistanceKm: orderPlanRequest.deliveryDistanceKm,
      total: orderPlanRequest.total,
      status: "new",
      source: "landing",
    });

    let checkoutPayload = null;

    if (isRazorpayConfigured() && Number(orderPlan.total || 0) > 0) {
      if (orderPlan.mode === "one_time") {
        const razorpayOrder = await createRazorpayOrder({
          amount: Math.round(Number(orderPlan.total) * 100),
          currency: orderPlan.currency || "INR",
          receipt: `order_plan_${Date.now()}`,
          notes: {
            orderPlanId: orderPlan.id,
            mode: orderPlan.mode,
            customerEmail: orderPlan.email || "",
          },
        });

        orderPlan.status = "payment_pending";
        orderPlan.payment = {
          provider: "razorpay",
          status: "order_created",
          amount: Number(orderPlan.total || 0),
          currency: orderPlan.currency || "INR",
          orderId: razorpayOrder.id || "",
        };
        await orderPlan.save();

        checkoutPayload = buildOrderPlanCheckoutPayload({
          orderPlan,
          mode: "one_time",
          razorpayOrder,
        });
      } else {
        const cadenceConfig = getSubscriptionDurationConfig(
          orderPlan.cadence,
          orderPlan.durationWeeks
        );
        const lineupSummary = buildLineupSummary(orderPlan.items);
        const plan = await createRazorpayPlan({
          period: cadenceConfig.period,
          interval: cadenceConfig.interval,
          amount: Math.round(Number(orderPlan.total || 0) * 100),
          currency: orderPlan.currency || "INR",
          name: `Good Gut Hut ${cadenceConfig.label} Subscription`,
          description:
            lineupSummary ||
            `${cadenceConfig.label} fermented drinks subscription for ${cadenceConfig.durationLabel}`,
          notes: {
            orderPlanId: orderPlan.id,
            cadence: orderPlan.cadence,
            durationWeeks: String(orderPlan.durationWeeks || ""),
            email: orderPlan.email,
          },
        });
        const razorpaySubscription = await createRazorpaySubscription({
          planId: plan.id,
          totalCount: cadenceConfig.totalCount,
          expireBy: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
          startAt: Math.floor(
            parseDateKeyToIstDate(orderPlan.firstDeliveryDate || orderPlan.startDate).getTime() / 1000
          ),
          notes: {
            orderPlanId: orderPlan.id,
            cadence: orderPlan.cadence,
            durationWeeks: String(orderPlan.durationWeeks || ""),
            email: orderPlan.email,
          },
        });

        orderPlan.payment = {
          provider: "razorpay",
          status: razorpaySubscription.status || "created",
          planId: plan.id || "",
          subscriptionId: razorpaySubscription.id || "",
          shortUrl: razorpaySubscription.short_url || "",
          amount: orderPlan.total,
          currency: orderPlan.currency,
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
        orderPlan.nextDeliveryDate = getNextSubscriptionDeliveryDate({
          startDate: orderPlan.firstDeliveryDate || orderPlan.startDate,
          cadence: orderPlan.cadence,
          paidCount: razorpaySubscription.paid_count || 0,
          totalCount: razorpaySubscription.total_count || cadenceConfig.totalCount,
        });
        await orderPlan.save();

        checkoutPayload = buildOrderPlanCheckoutPayload({
          orderPlan,
          mode: "recurring",
          razorpaySubscription,
        });
      }
    } else {
      orderPlan.payment = {
        provider: "",
        status: "not_required",
        amount: Number(orderPlan.total || 0),
        currency: orderPlan.currency || "INR",
      };
      orderPlan.status = "active";
      await orderPlan.save();
    }

    if (!checkoutPayload) {
      try {
        await sendOrderPlanConfirmationEmail({ orderPlan });
        orderPlan.notifications.confirmationEmailSentAt = new Date();
        await orderPlan.save();
      } catch (notificationError) {
        console.error("Failed to send order plan confirmation email", notificationError);
      }
    }

    return NextResponse.json({
      id: orderPlan.id,
      orderPlan: serializeOrderPlan(orderPlan),
      checkoutToken: checkoutPayload?.checkoutToken || "",
      razorpay: checkoutPayload?.razorpay || getRazorpayPublicConfig(),
      requiresPaymentSetup: Boolean(checkoutPayload?.checkoutToken),
      message:
        orderPlan.mode === "one_time"
          ? checkoutPayload?.checkoutToken
            ? "Order created. Complete payment to confirm your delivery."
            : "Order created and confirmed."
          : checkoutPayload?.checkoutToken
            ? "Plan created. Complete Razorpay setup to activate recurring auto-pay."
            : "Plan created and confirmed.",
    });
  } catch (error) {
    console.error(error);
    if (
      error.message?.startsWith("SKU ") ||
      error.message === "Recurring subscription access is not enabled for this link." ||
      error.message === "Select a valid order mode." ||
      error.message === "Enter a valid name." ||
      error.message === "Enter a valid phone number." ||
      error.message === "Enter a valid email address." ||
      error.message === "Enter a valid delivery address." ||
      error.message === "Select a valid subscription cadence." ||
      error.message === "Select a valid subscription duration." ||
      error.message === "Select one of the available subscription combos." ||
      error.message === "Select one of the available sets." ||
      error.message === "Invalid delivery placeId." ||
      error.message === "Invalid delivery lookup session." ||
      error.message === "Please select a delivery address from the suggestions." ||
      error.message === "Add at least one product quantity (SKU + quantity) before placing your order." ||
      error.message === "Add at least one product quantity (SKU + quantity) before starting a subscription." ||
      error.message === "Too many distinct products in one order." ||
      error.message === "Too many distinct products in one subscription." ||
      error.message?.startsWith("Orders must include at least ") ||
      error.message?.startsWith("Orders cannot include more than ") ||
      error.message?.startsWith("Subscriptions must include at least ") ||
      error.message?.startsWith("Subscriptions cannot include more than ") ||
      error.message === RECURRING_SEASONAL_FULL_PERIOD_ERROR ||
      error.message === "Subscriptions are not available until delivery days are configured." ||
      error.message === "Orders are not available until delivery days are configured." ||
      error.message === "There are no delivery dates available in the next 30 days." ||
      error.message === "Choose a valid first delivery date within the next 30 days." ||
      error.message === "We do not deliver there yet."
    ) {
      logAbuseEvent("order-plan-invalid-request", req, { message: error.message });
      return jsonError(error.message, 400);
    }
    logAbuseEvent("order-plan-server-error", req, { message: error.message });
    return jsonError(error.message || "Could not create order.", 500);
  }
}

