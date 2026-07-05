import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";
import {
  getPhoneMatchKey,
  grantDiscountCodeToPhone,
  isDiscountCodeActive,
} from "@/libs/discount-codes";
import DiscountCode from "@/models/DiscountCode";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import RetentionNudge from "@/models/RetentionNudge";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const ORDER_PLAN_ACTIVE_STATUSES = ["active", "confirmed", "shipped", "fulfilled"];
const PREORDER_ACTIVE_STATUSES = ["paid", "confirmed", "shipped", "fulfilled"];

const toTimestamp = (value) => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const normalizeThresholdDays = (value) =>
  Math.max(1, Math.min(365, Math.round(Number(value || 60))));

const buildOrderPlanCustomerRecord = (orderPlan = {}) => ({
  sourceType: "order_plan",
  sourceId: orderPlan.id || orderPlan._id?.toString?.() || "",
  customerName: orderPlan.name || "",
  email: orderPlan.email || "",
  phone: orderPlan.phone || "",
  phoneKey: getPhoneMatchKey(orderPlan.phone || ""),
  lastOrderAt: orderPlan.createdAt || orderPlan.updatedAt || null,
  lastOrderTotal: Number(orderPlan.total || 0),
  currency: orderPlan.currency || "INR",
  orderNumber: orderPlan.orderNumber || "",
});

const buildPreorderCustomerRecord = (preorder = {}) => ({
  sourceType: "legacy_preorder",
  sourceId: preorder.id || preorder._id?.toString?.() || "",
  customerName: preorder.customerName || "",
  email: preorder.email || "",
  phone: preorder.phone || "",
  phoneKey: getPhoneMatchKey(preorder.phone || ""),
  lastOrderAt: preorder.createdAt || preorder.updatedAt || null,
  lastOrderTotal: Number(preorder.total || 0),
  currency: preorder.currency || "INR",
  orderNumber: preorder.orderNumber || "",
});

const mergeCustomerRecord = (current, next) => {
  if (!current) {
    return next;
  }

  const nextIsNewer = toTimestamp(next.lastOrderAt) > toTimestamp(current.lastOrderAt);

  if (!nextIsNewer) {
    return {
      ...current,
      email: current.email || next.email || "",
      customerName: current.customerName || next.customerName || "",
    };
  }

  return {
    ...next,
    email: next.email || current.email || "",
    customerName: next.customerName || current.customerName || "",
  };
};

export const listLapsedCustomers = async ({ thresholdDays = 60, limit = 200 } = {}) => {
  const normalizedThresholdDays = normalizeThresholdDays(thresholdDays);
  const cutoff = new Date(Date.now() - normalizedThresholdDays * 24 * 60 * 60 * 1000);
  const [orderPlans, preorders] = await Promise.all([
    OrderPlan.find({ status: { $in: ORDER_PLAN_ACTIVE_STATUSES } })
      .sort({ createdAt: -1 })
      .limit(2000),
    Preorder.find({ status: { $in: PREORDER_ACTIVE_STATUSES } })
      .sort({ createdAt: -1 })
      .limit(2000),
  ]);
  const byPhoneKey = new Map();

  [...orderPlans.map(buildOrderPlanCustomerRecord), ...preorders.map(buildPreorderCustomerRecord)]
    .filter((record) => record.phoneKey && record.lastOrderAt)
    .forEach((record) => {
      byPhoneKey.set(record.phoneKey, mergeCustomerRecord(byPhoneKey.get(record.phoneKey), record));
    });

  const candidates = [...byPhoneKey.values()]
    .filter((record) => new Date(record.lastOrderAt).getTime() <= cutoff.getTime())
    .sort((left, right) => toTimestamp(left.lastOrderAt) - toTimestamp(right.lastOrderAt))
    .slice(0, limit);
  const phoneKeys = candidates.map((record) => record.phoneKey);
  const nudges = phoneKeys.length
    ? await RetentionNudge.find({ phoneKey: { $in: phoneKeys } }).sort({ sentAt: -1 })
    : [];
  const latestNudgeByPhoneKey = new Map();

  nudges.forEach((nudge) => {
    if (!latestNudgeByPhoneKey.has(nudge.phoneKey)) {
      latestNudgeByPhoneKey.set(nudge.phoneKey, nudge);
    }
  });

  return candidates.map((record) => {
    const latestNudge = latestNudgeByPhoneKey.get(record.phoneKey);

    return {
      ...record,
      lastOrderAt: record.lastOrderAt ? new Date(record.lastOrderAt).toISOString() : null,
      lastNudgedAt: latestNudge?.sentAt ? new Date(latestNudge.sentAt).toISOString() : null,
      lastNudgeCode: latestNudge?.code || "",
      lastNudgeStatus: latestNudge?.emailStatus || "",
    };
  });
};

const sendRetentionEmail = async ({ customer, discountCode }) => {
  if (!customer.email) {
    return { status: "skipped", reason: "missing_email" };
  }

  const code = discountCode.code;
  const amount = Number(discountCode.amount || 0);
  const title = "A fresh reason to come back";
  const text = [
    customer.customerName ? `Hello ${customer.customerName},` : "Hello,",
    "",
    "We would love to make your next Good Gut Hut order a little sweeter.",
    `Use code ${code} for ${amount}% off your next order.`,
    "",
    `Order here: https://${config.domainName}/`,
    "",
    "Need help? Reply to this email or WhatsApp us.",
  ].join("\n");

  await sendResendEmail({
    to: customer.email,
    subject: `${amount}% off your next Good Gut Hut order`,
    text,
    html: emailTemplate({
      eyebrow: "A Little Nudge",
      title,
      subtitle: "Here is a small thank-you for coming back to Good Gut Hut.",
      contentHtml: `
        <p>${customer.customerName ? `Hello ${escapeHtml(customer.customerName)},` : "Hello,"}</p>
        <p>We would love to make your next Good Gut Hut order a little sweeter.</p>
        <p>Use code <strong>${escapeHtml(code)}</strong> for <strong>${escapeHtml(String(amount))}% off</strong> your next order.</p>
        <p><a href="https://${escapeHtml(config.domainName)}/" class="button">Order now</a></p>
      `,
      footer: `Need help? Email ${config.mailgun.supportEmail}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { status: "sent" };
};

export const sendRetentionNudge = async ({ phoneKey = "", discountCodeId = "" }) => {
  const customers = await listLapsedCustomers({ thresholdDays: 1, limit: 5000 });
  const customer = customers.find((item) => item.phoneKey === phoneKey);

  if (!customer) {
    throw new Error("Customer was not found in lapsed customer history.");
  }

  const discountCode = await DiscountCode.findById(discountCodeId);

  if (!isDiscountCodeActive(discountCode)) {
    throw new Error("Choose an active discount code.");
  }

  if (discountCode.isNumberRestricted) {
    await grantDiscountCodeToPhone({
      discountCode,
      phone: customer.phone,
      source: "retention_nudge",
      sourceType: customer.sourceType,
      sourceId: customer.sourceId,
    });
  }

  let emailDelivery;

  try {
    emailDelivery = await sendRetentionEmail({ customer, discountCode });
  } catch (error) {
    emailDelivery = { status: "failed", error: error.message || "Could not send email." };
  }

  const nudge = await RetentionNudge.create({
    phone: customer.phone,
    phoneKey: customer.phoneKey,
    email: customer.email || "",
    customerName: customer.customerName || "",
    discountCode: discountCode._id,
    code: discountCode.code,
    discountAmount: Number(discountCode.amount || 0),
    emailStatus: emailDelivery.status === "sent" ? "sent" : emailDelivery.status === "skipped" ? "skipped" : "failed",
    emailError: emailDelivery.error || emailDelivery.reason || "",
    lastOrderAt: customer.lastOrderAt ? new Date(customer.lastOrderAt) : null,
    lastOrderTotal: Number(customer.lastOrderTotal || 0),
    sourceType: customer.sourceType,
    sourceId: customer.sourceId,
    sentAt: new Date(),
  });

  return {
    customer: {
      ...customer,
      lastNudgedAt: nudge.sentAt ? new Date(nudge.sentAt).toISOString() : null,
      lastNudgeCode: nudge.code || "",
      lastNudgeStatus: nudge.emailStatus || "",
    },
    emailDelivery,
    nudge,
  };
};
