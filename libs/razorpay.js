import crypto from "crypto";

const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || "").trim();
const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const razorpayWebhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();

const normalizeString = (value = "") => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

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
  const normalizedOrderId = normalizeString(orderId);
  const normalizedPaymentId = normalizeString(paymentId);
  const normalizedSignature = normalizeString(signature).toLowerCase();

  if (!razorpayKeySecret || !normalizedOrderId || !normalizedPaymentId || !normalizedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${normalizedOrderId}|${normalizedPaymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(normalizedSignature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

export const extractRazorpayPaymentResult = (body = {}) => {
  const payload = body?.paymentResult && typeof body.paymentResult === "object"
    ? body.paymentResult
    : body?.response && typeof body.response === "object"
      ? body.response
      : body;

  return {
    orderId: normalizeString(
      payload?.razorpay_order_id ||
        payload?.orderId ||
        payload?.order_id ||
        payload?.order?.id
    ),
    paymentId: normalizeString(
      payload?.razorpay_payment_id ||
        payload?.paymentId ||
        payload?.payment_id ||
        payload?.payment?.id
    ),
    signature: normalizeString(
      payload?.razorpay_signature ||
        payload?.signature ||
        payload?.paymentSignature
    ),
  };
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

export const fetchRazorpayPayment = async (paymentId = "") => {
  const normalizedPaymentId = normalizeString(paymentId);

  if (!isRazorpayConfigured() || !normalizedPaymentId) {
    return null;
  }

  const authToken = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/payments/${normalizedPaymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Razorpay payment lookup failed: ${errorBody}`);
  }

  return response.json();
};

export const verifyRazorpayPaymentWithApi = async ({
  orderId = "",
  paymentId = "",
  expectedAmount = null,
  expectedCurrency = "",
}) => {
  const normalizedOrderId = normalizeString(orderId);
  const normalizedPaymentId = normalizeString(paymentId);
  const normalizedCurrency = normalizeString(expectedCurrency).toUpperCase();

  if (!normalizedOrderId || !normalizedPaymentId) {
    return { ok: false, reason: "missing_ids" };
  }

  let payment;

  try {
    payment = await fetchRazorpayPayment(normalizedPaymentId);
  } catch (error) {
    return {
      ok: false,
      reason: "api_lookup_failed",
      message: error?.message || "Razorpay payment lookup failed.",
    };
  }

  if (!payment) {
    return { ok: false, reason: "missing_payment" };
  }

  const paymentOrderId = normalizeString(payment.order_id);
  const paymentStatus = normalizeString(payment.status).toLowerCase();
  const paymentCurrency = normalizeString(payment.currency).toUpperCase();
  const paymentAmount = Number(payment.amount || 0);
  const normalizedExpectedAmount =
    expectedAmount === null || expectedAmount === undefined ? null : Number(expectedAmount);

  if (paymentOrderId !== normalizedOrderId) {
    return { ok: false, reason: "order_mismatch", payment };
  }

  if (!["authorized", "captured"].includes(paymentStatus)) {
    return { ok: false, reason: "payment_not_successful", payment };
  }

  if (normalizedCurrency && paymentCurrency && paymentCurrency !== normalizedCurrency) {
    return { ok: false, reason: "currency_mismatch", payment };
  }

  if (normalizedExpectedAmount !== null && paymentAmount !== normalizedExpectedAmount) {
    return { ok: false, reason: "amount_mismatch", payment };
  }

  return { ok: true, payment };
};

export const getRazorpayPaymentVerificationError = ({
  orderId = "",
  paymentId = "",
  signature = "",
  paymentCheck = null,
} = {}) => {
  const normalizedOrderId = normalizeString(orderId);
  const normalizedPaymentId = normalizeString(paymentId);
  const normalizedSignature = normalizeString(signature);
  const reason = paymentCheck?.reason || "signature_verification_failed";
  const paymentStatus = normalizeString(paymentCheck?.payment?.status).toLowerCase();

  if (!normalizedOrderId || !normalizedPaymentId) {
    return "Payment verification failed because Razorpay did not return a valid order ID or payment ID.";
  }

  if (!normalizedSignature && reason === "signature_verification_failed") {
    return "Payment verification failed because Razorpay did not return a payment signature.";
  }

  if (reason === "api_lookup_failed") {
    return `Payment verification failed because Razorpay payment lookup did not succeed for payment ${normalizedPaymentId}.`;
  }

  if (reason === "missing_payment") {
    return `Payment verification failed because payment ${normalizedPaymentId} could not be found in Razorpay.`;
  }

  if (reason === "order_mismatch") {
    return `Payment verification failed because payment ${normalizedPaymentId} does not belong to order ${normalizedOrderId}.`;
  }

  if (reason === "amount_mismatch") {
    return `Payment verification failed because Razorpay returned a different amount for payment ${normalizedPaymentId}.`;
  }

  if (reason === "currency_mismatch") {
    return `Payment verification failed because Razorpay returned a different currency for payment ${normalizedPaymentId}.`;
  }

  if (reason === "payment_not_successful") {
    return `Payment verification failed because Razorpay reports payment ${normalizedPaymentId} as ${paymentStatus || "not successful"}.`;
  }

  return `Payment verification failed for order ${normalizedOrderId} and payment ${normalizedPaymentId}.`;
};

export const verifyRazorpayWebhookSignature = (body, signature) => {
  const normalizedSignature = normalizeString(signature).toLowerCase();

  if (!razorpayWebhookSecret || !normalizedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", razorpayWebhookSecret)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(normalizedSignature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};
