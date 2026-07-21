import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import OrderPlan from "@/models/OrderPlan";
import {
  enforceBrowserOrigin,
  jsonError,
  logAbuseEvent,
  readJsonBody,
} from "@/libs/request-protection";
import {
  doesContactMatchOrder,
  isValidTrackingContact,
  isValidTrackingOrderNumber,
  normalizeTrackingOrderNumber,
  serializeTrackedOrder,
} from "@/libs/order-tracking";

const findTrackedOrder = async (orderNumber) => {
  const [preorder, orderPlan] = await Promise.all([
    Preorder.findOne({ orderNumber }),
    OrderPlan.findOne({ orderNumber }),
  ]);

  if (preorder) {
    return { order: preorder, recordType: "preorder" };
  }

  if (orderPlan) {
    return { order: orderPlan, recordType: "order_plan" };
  }

  return null;
};

export async function POST(req) {
  const originError = enforceBrowserOrigin(req);

  if (originError) {
    return originError;
  }

  let body = {};

  try {
    body = await readJsonBody(req, { maxBytes: 2048 });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("order-tracking-request-too-large", req);
      return jsonError("Request is too large.", 413);
    }

    if (error.message === "INVALID_JSON") {
      logAbuseEvent("order-tracking-invalid-json", req);
      return jsonError("Invalid request.", 400);
    }

    throw error;
  }

  const orderNumber = normalizeTrackingOrderNumber(body.orderNumber);
  const contact = String(body.contact || "").trim();

  if (!isValidTrackingOrderNumber(orderNumber) || !isValidTrackingContact(contact)) {
    return jsonError("Enter a valid order number and phone or email.", 400);
  }

  await connectMongo();

  const tracked = await findTrackedOrder(orderNumber);

  if (!tracked || !doesContactMatchOrder(tracked.order, contact)) {
    logAbuseEvent("order-tracking-lookup-failed", req, {
      orderNumberLength: orderNumber.length,
    });
    return NextResponse.json(
      {
        error:
          "We could not find an order matching that order number and phone or email.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    order: serializeTrackedOrder(tracked),
  });
}
