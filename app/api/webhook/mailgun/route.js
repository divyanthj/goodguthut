import crypto from "crypto";
import { NextResponse } from "next/server";
import { sendEmail } from "@/libs/mailgun";
import config from "@/config";

const MAILGUN_SIGNATURE_TOLERANCE_SECONDS = 15 * 60;

const verifyMailgunSignature = ({ timestamp, token, signature }) => {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || "";

  if (!signingKey || !timestamp || !token || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}${token}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};

const isFreshTimestamp = (timestamp) => {
  const numericTimestamp = Number(timestamp);

  if (!Number.isFinite(numericTimestamp)) {
    return false;
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - numericTimestamp);
  return ageSeconds <= MAILGUN_SIGNATURE_TOLERANCE_SECONDS;
};

export async function POST(req) {
  try {
    const formData = await req.formData();
    const timestamp = formData.get("timestamp");
    const token = formData.get("token");
    const signature = formData.get("signature");

    if (!verifyMailgunSignature({ timestamp, token, signature })) {
      return NextResponse.json({ error: "Invalid Mailgun webhook signature." }, { status: 401 });
    }

    if (!isFreshTimestamp(timestamp)) {
      return NextResponse.json({ error: "Expired Mailgun webhook timestamp." }, { status: 401 });
    }

    const sender = formData.get("From");
    const subject = formData.get("Subject");
    const html = formData.get("body-html");

    if (config.mailgun.forwardRepliesTo && html && subject && sender) {
      await sendEmail({
        to: config.mailgun.forwardRepliesTo,
        subject: `${config?.appName} | ${subject}`,
        html: `<div><p><b>- Subject:</b> ${subject}</p><p><b>- From:</b> ${sender}</p><p><b>- Content:</b></p><div>${html}</div></div>`,
        replyTo: sender,
      });
    }

    return NextResponse.json({});
  } catch (e) {
    console.error(e?.message);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
