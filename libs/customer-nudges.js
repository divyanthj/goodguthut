import config from "@/config";
import { getPhoneMatchKey } from "@/libs/discount-codes";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";
import CustomerNudge from "@/models/CustomerNudge";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";

const SUCCESSFUL_ORDER_PLAN_STATUSES = new Set(["active", "confirmed", "shipped", "fulfilled"]);
const SUCCESSFUL_PREORDER_STATUSES = new Set(["paid", "confirmed", "shipped", "fulfilled"]);

const toIsoString = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getCustomerKey = ({ phone = "", email = "" } = {}) => {
  const phoneKey = getPhoneMatchKey(phone);
  if (phoneKey) return `phone:${phoneKey}`;
  const emailKey = String(email || "").trim().toLowerCase();
  return emailKey ? `email:${emailKey}` : "";
};

const normalizeItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(item?.productName || item?.sku || "").trim(),
      quantity: Number(item?.quantity || 0),
    }))
    .filter((item) => item.name);

const normalizeOrderPlan = (order = {}) => ({
  id: String(order._id || order.id || ""),
  sourceType: "order_plan",
  customerName: order.name || "",
  phone: order.phone || "",
  email: order.email || "",
  orderNumber: order.orderNumber || "",
  status: order.status || "",
  mode: order.mode || "",
  currency: order.currency || "INR",
  total: Number(order.total || 0),
  items: normalizeItems(order.items),
  createdAt: order.createdAt || order.updatedAt || null,
  successful: SUCCESSFUL_ORDER_PLAN_STATUSES.has(order.status),
});

const normalizePreorder = (order = {}) => ({
  id: String(order._id || order.id || ""),
  sourceType: "legacy_preorder",
  customerName: order.customerName || "",
  phone: order.phone || "",
  email: order.email || "",
  orderNumber: order.orderNumber || "",
  status: order.status || "",
  mode: "one_time",
  currency: order.currency || "INR",
  total: Number(order.total || 0),
  items: normalizeItems(order.items),
  createdAt: order.createdAt || order.updatedAt || null,
  successful: SUCCESSFUL_PREORDER_STATUSES.has(order.status),
});

const serializeHistory = (nudge) => ({
  id: String(nudge._id || nudge.id || ""),
  channel: nudge.channel,
  nudgeType: nudge.nudgeType || "personal",
  title: nudge.title || "",
  subject: nudge.subject || "",
  message: nudge.message || "",
  status: nudge.status,
  error: nudge.error || "",
  sentAt: toIsoString(nudge.sentAt || nudge.createdAt),
  createdBy: nudge.createdBy || "",
});

export const listCustomersFromOrders = async () => {
  const [orderPlans, preorders] = await Promise.all([
    OrderPlan.find({}).sort({ createdAt: -1 }).lean(),
    Preorder.find({}).sort({ createdAt: -1 }).lean(),
  ]);
  const orders = [
    ...orderPlans.map(normalizeOrderPlan),
    ...preorders.map(normalizePreorder),
  ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  const byCustomer = new Map();

  orders.forEach((order) => {
    const customerKey = getCustomerKey(order);
    if (!customerKey) return;

    const current = byCustomer.get(customerKey) || {
      customerKey,
      customerName: "",
      phone: "",
      email: "",
      currency: order.currency || "INR",
      orders: [],
    };

    current.customerName = current.customerName || order.customerName || "";
    current.phone = current.phone || order.phone || "";
    current.email = current.email || order.email || "";
    current.orders.push(order);
    byCustomer.set(customerKey, current);
  });

  const customers = [...byCustomer.values()].map((customer) => {
    const successfulOrders = customer.orders.filter((order) => order.successful);
    const spendOrders = successfulOrders.length ? successfulOrders : customer.orders;

    return {
      ...customer,
      orderCount: customer.orders.length,
      totalSpend: spendOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      lastOrderAt: toIsoString(customer.orders[0]?.createdAt),
      orders: customer.orders.map((order) => ({
        ...order,
        createdAt: toIsoString(order.createdAt),
      })),
    };
  });
  const customerKeys = customers.map((customer) => customer.customerKey);
  const nudges = customerKeys.length
    ? await CustomerNudge.find({ customerKey: { $in: customerKeys } }).sort({ sentAt: -1 }).lean()
    : [];
  const historyByCustomer = new Map();

  nudges.forEach((nudge) => {
    const history = historyByCustomer.get(nudge.customerKey) || [];
    history.push(serializeHistory(nudge));
    historyByCustomer.set(nudge.customerKey, history);
  });

  return customers
    .map((customer) => ({
      ...customer,
      nudgeHistory: historyByCustomer.get(customer.customerKey) || [],
      lastNudgedAt: historyByCustomer.get(customer.customerKey)?.[0]?.sentAt || null,
    }))
    .sort((left, right) => new Date(right.lastOrderAt || 0) - new Date(left.lastOrderAt || 0));
};

export const findCustomerFromOrders = async (customerKey) => {
  const customers = await listCustomersFromOrders();
  return customers.find((customer) => customer.customerKey === customerKey) || null;
};

const suggestionSchema = {
  name: "customer_nudge_suggestions",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "suggestions"],
    properties: {
      summary: { type: "string" },
      suggestions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "title", "reason", "emailSubject", "message"],
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            reason: { type: "string" },
            emailSubject: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
  },
};

export const generateCustomerNudgeSuggestions = async (customer) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI is not configured. Add OPENAI_API_KEY to generate suggestions.");
  }

  const orderContext = customer.orders.slice(0, 20).map((order) => ({
    date: order.createdAt,
    status: order.status,
    orderType: order.mode === "recurring" ? "recurring" : "one-time",
    items: order.items,
    total: order.total,
    currency: order.currency,
  }));
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CUSTOMER_NUDGE_MODEL || "gpt-4.1-mini",
      temperature: 0.7,
      max_tokens: 1200,
      response_format: { type: "json_schema", json_schema: suggestionSchema },
      messages: [
        {
          role: "system",
          content: `You are Good Gut Hut's thoughtful customer-retention assistant. Good Gut Hut sells fresh, gut-friendly food and drinks. Analyze the order history and return exactly three genuinely distinct, relevant outreach ideas. Keep every message warm, concise, specific, non-pushy, and ready for either email or WhatsApp. Never invent discounts, health claims, customer facts, products, recipes, serving advice, or delivery promises. Do not infer gender or use gendered pronouns; use the customer's first name or "they". Do not mention AI or analysis. Use Indian English. Messages should be plain text, begin with a natural greeting using the customer's first name when available, and make it easy to reply.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            customer: {
              name: customer.customerName || "",
              orderCount: customer.orderCount,
              lastOrderAt: customer.lastOrderAt,
            },
            orders: orderContext,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI customer nudge request failed", response.status, body);
    throw new Error("We could not prepare nudge ideas right now. Please try again.");
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty set of nudge ideas.");

  return JSON.parse(content);
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sendCustomerNudgeEmail = async ({ customer, subject, message }) => {
  if (!customer.email) throw new Error("This customer does not have an email address.");

  await sendResendEmail({
    to: customer.email,
    subject,
    text: message,
    html: emailTemplate({
      eyebrow: "A Note From Good Gut Hut",
      title: subject,
      subtitle: "Fresh from our kitchen, with a little thought for you.",
      contentHtml: `<p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>`,
      footer: `Questions? Reply to this email or WhatsApp us. ${config.mailgun.supportEmail}`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });
};

export const recordCustomerNudge = async ({
  customer,
  channel,
  nudgeType,
  title,
  subject,
  message,
  status,
  error = "",
  createdBy = "",
}) =>
  CustomerNudge.create({
    customerKey: customer.customerKey,
    customerName: customer.customerName || "",
    phone: customer.phone || "",
    email: customer.email || "",
    channel,
    nudgeType: nudgeType || "personal",
    title: title || "",
    subject: subject || "",
    message,
    status,
    error,
    orderCount: customer.orderCount,
    lastOrderAt: customer.lastOrderAt ? new Date(customer.lastOrderAt) : null,
    createdBy,
    sentAt: new Date(),
  });

export const serializeCustomerNudge = serializeHistory;
