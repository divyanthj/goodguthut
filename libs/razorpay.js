import crypto from "crypto";

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || "";
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

export const isRazorpayConfigured = () => {
  return Boolean(razorpayKeyId && razorpayKeySecret);
};

export const getRazorpayPublicConfig = () => ({
  key: razorpayKeyId,
  keyId: razorpayKeyId,
  isConfigured: isRazorpayConfigured(),
});

export const verifyRazorpayPaymentSignature = ({
  orderId = "",
  paymentId = "",
  signature = "",
}) => {
  if (!razorpayKeySecret || !orderId || !paymentId || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

export const createRazorpayOrder = async ({ amount, currency, receipt, notes = {} }) => {
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  const authToken = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency,
      receipt,
      notes,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Razorpay order creation failed: ${errorBody}`);
  }

  return response.json();
};

export const verifyRazorpayWebhookSignature = (body, signature) => {
  if (!razorpayWebhookSecret || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", razorpayWebhookSecret)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};
