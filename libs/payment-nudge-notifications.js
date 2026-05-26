import config from "@/config";
import { normalizeAdminOrderFromLegacyPreorder, normalizeAdminOrderFromOrderPlan } from "@/libs/admin-orders";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildItemSummaryText = (items = []) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map((item) => `${item.productName || item.sku || "Item"} x ${Number(item.quantity || 0)}`)
    .join(", ");

const buildItemSummaryHtml = (items = []) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map(
      (item) =>
        `<li>${escapeHtml(item.productName || item.sku || "Item")} <span aria-hidden="true">&times;</span> ${escapeHtml(
          String(Number(item.quantity || 0))
        )}</li>`
    )
    .join("");

const isPendingPaymentOrSetup = (order = {}) => {
  const paymentStatus = String(order.payment?.status || "").trim();

  if (order.mode === "recurring") {
    return paymentStatus === "created";
  }

  return ["pending", "order_created", "created"].includes(paymentStatus);
};

const buildPaymentRedirectUrl = (order = {}) => {
  if (!order.id) {
    return "";
  }

  const kind = order.sourceType === "legacy_preorder" ? "preorder" : "order";

  return `https://${config.domainName}/pay/${kind}/${encodeURIComponent(order.id)}`;
};

export const normalizePaymentNudgeOrder = ({ sourceType, record }) => {
  if (sourceType === "legacy_preorder") {
    return normalizeAdminOrderFromLegacyPreorder({
      ...record.toObject?.(),
      id: record.id,
      sourceType,
    });
  }

  return normalizeAdminOrderFromOrderPlan({
    ...record.toObject?.(),
    id: record.id,
    sourceType,
  });
};

export const sendPaymentNudgeEmail = async ({ order }) => {
  if (!order?.email) {
    return { status: "skipped", reason: "missing_email" };
  }

  if (!isPendingPaymentOrSetup(order)) {
    return { status: "skipped", reason: "not_pending" };
  }

  const isRecurring = order.mode === "recurring";
  const paymentRedirectUrl = buildPaymentRedirectUrl(order);
  const itemSummaryText = buildItemSummaryText(order.items);
  const itemSummaryHtml = buildItemSummaryHtml(order.items);
  const orderNumber = order.orderNumber || order.id || "your order";
  const actionText = isRecurring
    ? "Please complete your UPI AutoPay mandate setup so we can activate your recurring plan."
    : "Please complete your payment so we can confirm your order.";
  const linkText = paymentRedirectUrl ? `Payment link: ${paymentRedirectUrl}` : "";

  const text = [
    order.customerName ? `Hello ${order.customerName},` : "Hello,",
    "",
    `A quick nudge from Good Gut Hut about ${orderNumber}.`,
    actionText,
    linkText,
    "",
    itemSummaryText ? `Lineup: ${itemSummaryText}` : "",
    `Total: ${order.currency || "INR"} ${Number(order.total || 0).toFixed(2)}`,
    "",
    `Need help? Reply to this email or WhatsApp us.`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendResendEmail({
    to: order.email,
    subject: isRecurring
      ? "Complete your Good Gut Hut mandate setup"
      : "Complete your Good Gut Hut payment",
    text,
    html: emailTemplate({
      eyebrow: isRecurring ? "Mandate Setup Pending" : "Payment Pending",
      title: isRecurring ? "One small step to activate your plan" : "Complete your order payment",
      subtitle: `Your Good Gut Hut order ${escapeHtml(orderNumber)} is waiting for confirmation.`,
      contentHtml: `
        <p>${order.customerName ? `Hello ${escapeHtml(order.customerName)},` : "Hello,"}</p>
        <p>${escapeHtml(actionText)}</p>
        ${
          paymentRedirectUrl
            ? `<p><a href="${escapeHtml(paymentRedirectUrl)}" class="button">Complete payment</a></p>`
            : ""
        }
        <table role="presentation" class="summary-table">
          <tr><td>Order number</td><td>${escapeHtml(orderNumber)}</td></tr>
          <tr><td>Total</td><td>${escapeHtml(`${order.currency || "INR"} ${Number(order.total || 0).toFixed(2)}`)}</td></tr>
        </table>
        ${itemSummaryHtml ? `<h2 class="section-title">Your order</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
      `,
      footer: `Need help? Email ${config.mailgun.supportEmail}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { status: "sent" };
};
