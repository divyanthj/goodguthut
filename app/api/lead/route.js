import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import Lead from "@/models/Lead";
import {
  enforceBrowserOrigin,
  isValidEmail,
  jsonError,
  logAbuseEvent,
  normalizeEmail,
  readJsonBody,
} from "@/libs/request-protection";

// This route is used to store the leads that are generated from the landing page.
// The API call is initiated by <ButtonLead /> component
// Duplicate emails just return 200 OK
export async function POST(req) {
  const originError = enforceBrowserOrigin(req);

  if (originError) {
    return originError;
  }

  let body;

  try {
    body = await readJsonBody(req, { maxBytes: 2 * 1024 });
  } catch (e) {
    if (e.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("lead-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    logAbuseEvent("lead-invalid-json", req);
    return jsonError("Request body must be valid JSON.", 400);
  }

  const email = normalizeEmail(body.email || "");

  if (!email) {
    logAbuseEvent("lead-missing-email", req);
    return jsonError("Email is required.", 400);
  }

  if (!isValidEmail(email)) {
    logAbuseEvent("lead-invalid-email", req, { emailLength: email.length });
    return jsonError("Enter a valid email address.", 400);
  }

  try {
    await connectMongo();
    const lead = await Lead.findOne({ email });

    if (!lead) {
      await Lead.create({ email });

      // Here you can add your own logic
      // For instance, sending a welcome email (use the the sendEmail helper function from /libs/mailgun)
    }

    return NextResponse.json({});
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
