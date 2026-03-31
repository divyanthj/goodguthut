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

export const normalizeComparableEmail = (value = "") => normalizeString(value).toLowerCase();
const normalizePhoneNumber = (value = "") => normalizeString(value).replace(/\D/g, "");
export const getComparablePhoneNumber = (value = "") => {
  const digits = normalizePhoneNumber(value);

  if (digits.length <= 10) {
    return digits;
  }

  return digits.slice(-10);
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

export const verifyRazorpaySubscriptionSignature = ({
  subscriptionId = "",
  paymentId = "",
  signature = "",
}) => {
  const normalizedSubscriptionId = normalizeString(subscriptionId);
  const normalizedPaymentId = normalizeString(paymentId);
  const normalizedSignature = normalizeString(signature).toLowerCase();

  if (!razorpayKeySecret || !normalizedSubscriptionId || !normalizedPaymentId || !normalizedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${normalizedPaymentId}|${normalizedSubscriptionId}`)
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

export const extractRazorpaySubscriptionResult = (body = {}) => {
  const payload = body?.paymentResult && typeof body.paymentResult === "object"
    ? body.paymentResult
    : body?.response && typeof body.response === "object"
      ? body.response
      : body;

  return {
    subscriptionId: normalizeString(
      payload?.razorpay_subscription_id ||
        payload?.subscriptionId ||
        payload?.subscription_id ||
        payload?.subscription?.id
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

const razorpayApiRequest = async (path, { method = "GET", body } = {}) => {
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  const authToken = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com${path}`, {
    method,
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Razorpay request failed (${path}): ${errorBody}`);
  }

  return response.json();
};

export const createRazorpayPlan = async ({
  period,
  interval,
  amount,
  currency = "INR",
  name,
  description = "",
  notes = {},
}) =>
  razorpayApiRequest("/v1/plans", {
    method: "POST",
    body: {
      period,
      interval,
      item: {
        name,
        amount,
        currency,
        description,
      },
      notes,
    },
  });

export const createRazorpaySubscription = async ({
  planId,
  totalCount,
  quantity = 1,
  customerNotify = true,
  expireBy,
  notes = {},
}) =>
  razorpayApiRequest("/v1/subscriptions", {
    method: "POST",
    body: {
      plan_id: planId,
      total_count: totalCount,
      quantity,
      customer_notify: customerNotify ? 1 : 0,
      ...(expireBy ? { expire_by: expireBy } : {}),
      notes,
    },
  });

export const cancelRazorpaySubscription = async ({
  subscriptionId,
  cancelAtCycleEnd = false,
}) =>
  razorpayApiRequest(`/v1/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: {
      cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
    },
  });

export const fetchRazorpaySubscription = async (subscriptionId = "") => {
  const normalizedSubscriptionId = normalizeString(subscriptionId);

  if (!isRazorpayConfigured() || !normalizedSubscriptionId) {
    return null;
  }

  return razorpayApiRequest(`/v1/subscriptions/${normalizedSubscriptionId}`);
};

export const pauseRazorpaySubscription = async ({
  subscriptionId,
  pauseAt = "now",
}) =>
  razorpayApiRequest(`/v1/subscriptions/${subscriptionId}/pause`, {
    method: "POST",
    body: {
      pause_at: pauseAt,
    },
  });

export const resumeRazorpaySubscription = async ({
  subscriptionId,
  resumeAt = "now",
}) =>
  razorpayApiRequest(`/v1/subscriptions/${subscriptionId}/resume`, {
    method: "POST",
    body: {
      resume_at: resumeAt,
    },
  });

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
  expectedPhone = "",
}) => {
  const normalizedPaymentId = normalizeString(paymentId);
  const normalizedCurrency = normalizeString(expectedCurrency).toUpperCase();
  const normalizedExpectedPhone = getComparablePhoneNumber(expectedPhone);

  if (!normalizedPaymentId) {
    return { ok: false, reason: "missing_payment_id" };
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
  const paymentContact = getComparablePhoneNumber(payment.contact);
  const normalizedExpectedAmount =
    expectedAmount === null || expectedAmount === undefined ? null : Number(expectedAmount);

  if (!["authorized", "captured"].includes(paymentStatus)) {
    return { ok: false, reason: "payment_not_successful", payment };
  }

  if (normalizedCurrency && paymentCurrency && paymentCurrency !== normalizedCurrency) {
    return { ok: false, reason: "currency_mismatch", payment };
  }

  if (normalizedExpectedAmount !== null && paymentAmount !== normalizedExpectedAmount) {
    return { ok: false, reason: "amount_mismatch", payment };
  }

  if (
    normalizedExpectedPhone &&
    paymentContact &&
    paymentContact !== normalizedExpectedPhone
  ) {
    return { ok: false, reason: "phone_mismatch", payment };
  }

  if (orderId && paymentOrderId && paymentOrderId !== normalizeString(orderId)) {
    return { ok: true, payment, warning: "order_mismatch_ignored" };
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
  const paymentOrderId = normalizeString(paymentCheck?.payment?.order_id);

  if (!normalizedPaymentId) {
    return "Payment verification failed because Razorpay did not return a valid payment ID.";
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

  if (reason === "missing_payment_id") {
    return "Payment verification failed because Razorpay did not return a valid payment ID.";
  }

  if (reason === "amount_mismatch") {
    return `Payment verification failed because Razorpay returned a different amount for payment ${normalizedPaymentId}.`;
  }

  if (reason === "currency_mismatch") {
    return `Payment verification failed because Razorpay returned a different currency for payment ${normalizedPaymentId}.`;
  }

  if (reason === "phone_mismatch") {
    return `Payment verification failed because Razorpay returned a different phone number for payment ${normalizedPaymentId}.`;
  }

  if (reason === "payment_not_successful") {
    return `Payment verification failed because Razorpay reports payment ${normalizedPaymentId} as ${paymentStatus || "not successful"}.`;
  }

  if (paymentOrderId) {
    return `Payment verification failed for payment ${normalizedPaymentId}. Razorpay linked it to order ${paymentOrderId}.`;
  }

  return `Payment verification failed for payment ${normalizedPaymentId}.`;
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

export const verifyRazorpaySubscriptionCustomer = ({
  payment = null,
  expectedEmail = "",
  expectedPhone = "",
} = {}) => {
  if (!payment || typeof payment !== "object") {
    return { ok: false, reason: "missing_payment" };
  }

  const normalizedExpectedEmail = normalizeComparableEmail(expectedEmail);
  const normalizedExpectedPhone = getComparablePhoneNumber(expectedPhone);
  const paymentEmail = normalizeComparableEmail(payment.email);
  const paymentContact = getComparablePhoneNumber(payment.contact);

  if (normalizedExpectedEmail && paymentEmail && paymentEmail !== normalizedExpectedEmail) {
    return { ok: false, reason: "email_mismatch", payment };
  }

  if (normalizedExpectedPhone && paymentContact && paymentContact !== normalizedExpectedPhone) {
    return { ok: false, reason: "phone_mismatch", payment };
  }

  return { ok: true, payment };
};
