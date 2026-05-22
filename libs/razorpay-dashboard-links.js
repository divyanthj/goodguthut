const RAZORPAY_DASHBOARD_BASE_URL = "https://dashboard.razorpay.com/app";

const normalizeRazorpayId = (value = "") => String(value || "").trim();

const RAZORPAY_DASHBOARD_PATHS = {
  order: "orders",
  payment: "payments",
  plan: "plans",
  subscription: "subscriptions",
};

export const getRazorpayDashboardUrl = (artifactType = "", id = "") => {
  const normalizedId = normalizeRazorpayId(id);
  const path = RAZORPAY_DASHBOARD_PATHS[artifactType];

  if (!path || !normalizedId) {
    return "";
  }

  return `${RAZORPAY_DASHBOARD_BASE_URL}/${path}/${encodeURIComponent(normalizedId)}`;
};

export const getRazorpayArtifactRows = (payment = {}) => [
  {
    label: "Subscription ID",
    value: normalizeRazorpayId(payment.subscriptionId),
    url: getRazorpayDashboardUrl("subscription", payment.subscriptionId),
  },
  {
    label: "Payment ID",
    value: normalizeRazorpayId(payment.paymentId || payment.lastPaymentId),
    url: getRazorpayDashboardUrl("payment", payment.paymentId || payment.lastPaymentId),
  },
  {
    label: "Order ID",
    value: normalizeRazorpayId(payment.orderId),
    url: getRazorpayDashboardUrl("order", payment.orderId),
  },
  {
    label: "Plan ID",
    value: normalizeRazorpayId(payment.planId),
    url: getRazorpayDashboardUrl("plan", payment.planId),
  },
  {
    label: "Setup link",
    value: normalizeRazorpayId(payment.shortUrl),
    url: normalizeRazorpayId(payment.shortUrl),
  },
].filter((row) => row.value);
