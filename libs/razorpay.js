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

const toBase64Url = (value) => Buffer.from(value).toString("base64url");
const fromBase64Url = (value) => Buffer.from(value, "base64url").toString("utf8");

export const createSignedCheckoutToken = (payload) => {
  if (!razorpayKeySecret) {
    throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  const expiresAt = Date.now() + 30 * 60 * 1000;
  const data = toBase64Url(JSON.stringify({ ...payload, expiresAt }));
  const signature = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
};

export const verifySignedCheckoutToken = (token = "") => {
  if (!razorpayKeySecret || !token.includes(".")) {
    return null;
  }

  const [data, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(data)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature || "");

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  const parsed = JSON.parse(fromBase64Url(data));

  if (!parsed?.expiresAt || parsed.expiresAt < Date.now()) {
    return null;
  }

  return parsed;
};

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
