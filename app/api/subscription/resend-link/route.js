import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import {
  enforceBrowserOrigin,
  isValidEmail,
  jsonError,
  logAbuseEvent,
  normalizeEmail,
  readJsonBody,
} from "@/libs/request-protection";
import { sendSubscriptionEditLinkEmail } from "@/libs/subscription-notifications";
import Subscription from "@/models/Subscription";

const successResponse = () =>
  NextResponse.json({
    message:
      "If we found a subscription for that email address, we have sent a fresh edit link.",
  });

export async function POST(req) {
  const originError = enforceBrowserOrigin(req);

  if (originError) {
    return originError;
  }

  let body;

  try {
    body = await readJsonBody(req, { maxBytes: 4 * 1024 });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("subscription-resend-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    logAbuseEvent("subscription-resend-invalid-json", req);
    return jsonError("Request body must be valid JSON.", 400);
  }

  const email = normalizeEmail(body.email || "");

  if (!email || !isValidEmail(email)) {
    logAbuseEvent("subscription-resend-invalid-email", req, { emailLength: email.length });
    return jsonError("Enter a valid email address.", 400);
  }

  try {
    await connectMongo();
    const subscription = await Subscription.findOne({ email }).sort({ updatedAt: -1, createdAt: -1 });

    if (subscription) {
      try {
        await sendSubscriptionEditLinkEmail({ subscription, subject: "Your fresh Good Gut Hut edit link" });
        subscription.lastEditLinkSentAt = new Date();
        await subscription.save();
      } catch (emailError) {
        console.error(emailError);
      }
    }

    return successResponse();
  } catch (error) {
    console.error(error);
    logAbuseEvent("subscription-resend-server-error", req, { message: error.message });
    return successResponse();
  }
}
