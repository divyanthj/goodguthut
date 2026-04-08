import { NextResponse } from "next/server";
import Preorder from "@/models/Preorder";
import { buildPreorderRequest } from "@/libs/preorder-request";
import { sendPreorderConfirmationNotifications } from "@/libs/emailSender";
import { recalculatePreorderWindowRouteSnapshot } from "@/libs/preorder-route-planner";
import {
  createRazorpayOrder,
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

const isDatabaseUnavailable = (message = "") => {
  return (
    message.includes("MongoDB SRV lookup failed") ||
    message.includes("buffering timed out") ||
    message.includes("Could not connect to MongoDB")
  );
};

const createPreorderDocument = async (orderRequest, payment = {}) => {
  const isPaidOrder = payment.status === "paid";

  return Preorder.create({
    customerName: orderRequest.customerName,
    email: orderRequest.email,
    phone: orderRequest.phone,
    address: orderRequest.address,
    normalizedDeliveryAddress: orderRequest.normalizedDeliveryAddress,
    fulfillmentMethod: orderRequest.fulfillmentMethod,
    pickupAddressSnapshot: orderRequest.pickupAddressSnapshot,
    pickupDoorNumber: orderRequest.pickupDoorNumber,
    customerNotes: orderRequest.customerNotes,
    preorderWindow: orderRequest.preorderWindow?.id || null,
    preorderWindowLabel: orderRequest.preorderWindow?.title || "",
    deliveryDate: orderRequest.preorderWindow?.deliveryDate || null,
    currency: orderRequest.currency,
    items: orderRequest.items,
    totalQuantity: orderRequest.totalQuantity,
    subtotal: orderRequest.subtotal,
    discount: orderRequest.discount,
    deliveryFee: orderRequest.deliveryFee,
    deliveryDistanceKm: orderRequest.deliveryDistanceKm,
    total: orderRequest.total,
    source: "landing",
    status: isPaidOrder ? "confirmed" : "pending",
    payment,
  });
};

export async function POST(req) {
  try {
    const originError = enforceBrowserOrigin(req);

    if (originError) {
      return originError;
    }

    const body = await readJsonBody(req, { maxBytes: 24 * 1024 });
    const orderRequest = await buildPreorderRequest(body);
    const allowTestBypass =
      process.env.NODE_ENV !== "production" && body.testBypassPayment === true;

    if (!allowTestBypass && isRazorpayConfigured() && Number(orderRequest.total || 0) > 0) {
      const razorpayOrder = await createRazorpayOrder({
        amount: Math.round(Number(orderRequest.total) * 100),
        currency: orderRequest.currency || "INR",
        receipt: `checkout_${Date.now()}`,
        notes: {
          customerName: orderRequest.customerName,
          customerEmail: orderRequest.email || "",
          customerPhone: orderRequest.phone || "",
        },
      });

      const checkoutToken = createSignedCheckoutToken({
        orderRequest,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      });

      return NextResponse.json({
        totalQuantity: orderRequest.totalQuantity,
        subtotal: orderRequest.subtotal,
        discount: orderRequest.discount,
        deliveryFee: orderRequest.deliveryFee,
        deliveryDistanceKm: orderRequest.deliveryDistanceKm,
        total: orderRequest.total,
        currency: orderRequest.currency,
        checkoutToken,
        razorpay: {
          ...getRazorpayPublicConfig(),
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          name: "Good Gut Hut",
          description: "Preorder payment",
          prefill: {
            name: orderRequest.customerName,
            email: orderRequest.email,
            contact: orderRequest.phone,
          },
        },
      });
    }

    const preorder = await createPreorderDocument(
      orderRequest,
      allowTestBypass
        ? {
            provider: "test",
            status: "paid",
            amount: orderRequest.total,
            currency: orderRequest.currency,
            paymentId: `test_${Date.now()}`,
            orderId: `test_order_${Date.now()}`,
            paidAt: new Date(),
          }
        : {
            provider: "",
            status: "not_required",
            amount: orderRequest.total,
            currency: orderRequest.currency,
          }
    );

    let notificationDelivery = {
      email: { status: "skipped" },
      whatsapp: { status: "skipped" },
    };

    if (allowTestBypass) {
      try {
        notificationDelivery = await sendPreorderConfirmationNotifications({ preorder });
      } catch (notificationError) {
        console.error("Failed to send test preorder confirmation notifications", notificationError);
        notificationDelivery = {
          email: { status: "failed" },
          whatsapp: { status: "failed" },
        };
      }
    }

    if (preorder.preorderWindow && preorder.fulfillmentMethod === "delivery" && preorder.status === "confirmed") {
      try {
        await recalculatePreorderWindowRouteSnapshot({
          preorderWindowId: preorder.preorderWindow,
        });
      } catch (routeError) {
        console.error("Failed to refresh preorder delivery route snapshot", routeError);
      }
    }

    return NextResponse.json({
      id: preorder.id,
      preorder,
      status: preorder.status,
      totalQuantity: preorder.totalQuantity,
      subtotal: preorder.subtotal,
      discount: preorder.discount,
      deliveryFee: preorder.deliveryFee,
      deliveryDistanceKm: preorder.deliveryDistanceKm,
      total: preorder.total,
      currency: preorder.currency,
      paymentStatus: preorder.payment?.status,
      emailDelivery: notificationDelivery.email,
      whatsappDelivery: notificationDelivery.whatsapp,
      razorpay: getRazorpayPublicConfig(),
      confirmationMessage:
        allowTestBypass
          ? "Test preorder created as a paid confirmed order without Razorpay."
          : "Preorder received. We will contact you on WhatsApp or by text to confirm your order before payment.",
    });
  } catch (e) {
    console.error(e);

    if (e.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("preorder-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    if (e.message === "INVALID_JSON") {
      logAbuseEvent("preorder-invalid-json", req);
      return jsonError("Request body must be valid JSON.", 400);
    }

    if (
      e.message?.startsWith("SKU ") ||
      e.message === "Invalid preorder window." ||
      e.message === "Selected preorder window was not found" ||
      e.message === "Preorders are closed for the selected delivery window" ||
      e.message === "Name, phone number, and address are required" ||
      e.message === "Name and phone number are required for pickup." ||
      e.message === "Enter a valid name." ||
      e.message === "Enter a valid email address." ||
      e.message === "Enter a valid phone number." ||
      e.message === "Enter a valid delivery address." ||
      e.message === "Pickup is not enabled for this preorder batch." ||
      e.message === "Invalid delivery placeId." ||
      e.message === "Invalid delivery lookup session." ||
      e.message === "Add at least one product quantity (SKU + quantity) before placing preorder" ||
      e.message === "Too many distinct products in one preorder." ||
      e.message === "Please select a delivery address from the suggestions." ||
      e.message === "Discount code not found." ||
      e.message === "This discount code is no longer active." ||
      e.message === "We do not deliver there yet." ||
      e.message?.startsWith("Minimum preorder quantity is ")
    ) {
      logAbuseEvent("preorder-invalid-request", req, { message: e.message });
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    if (isDatabaseUnavailable(e.message)) {
      logAbuseEvent("preorder-database-unavailable", req, { message: e.message });
      return NextResponse.json(
        {
          error:
            "Preorders are temporarily unavailable because the database connection could not be established. If you are using MongoDB Atlas, add MONGODB_DIRECT_URI with the standard non-SRV connection string.",
        },
        { status: 503 }
      );
    }

    logAbuseEvent("preorder-server-error", req, { message: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
