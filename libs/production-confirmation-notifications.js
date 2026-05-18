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

const formatDateOnly = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
  });
};

const getOrderSummaryDeliveryDate = (order = {}) => {
  if (order.sourceType === "legacy_preorder") {
    return order.firstDeliveryDate || order.nextDeliveryDate || null;
  }

  if (order.mode === "recurring") {
    return order.nextDeliveryDate || order.firstDeliveryDate || order.startDate || null;
  }

  return order.firstDeliveryDate || order.nextDeliveryDate || order.startDate || null;
};

const buildOrderDetailsText = (order = {}) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemSummary = items
    .filter((item) => item?.productName || item?.sku)
    .map((item) => {
      const name = item.productName || item.sku;
      const quantity = Number(item.quantity || 0);

      return quantity > 0 ? `${quantity} x ${name}` : name;
    })
    .join(", ");

  if (itemSummary) {
    return itemSummary;
  }

  return order.selectionSummary || order.orderNumber || "your order";
};

const buildOrderDetailsHtml = (order = {}) => {
  const items = Array.isArray(order.items) ? order.items : [];

  return items
    .filter((item) => item?.productName || item?.sku)
    .map((item) => {
      const name = item.productName || item.sku;
      const quantity = Number(item.quantity || 0);

      return `<li>${escapeHtml(quantity > 0 ? `${quantity} x ${name}` : name)}</li>`;
    })
    .join("");
};

export const normalizeProductionConfirmationOrder = ({ sourceType, record }) => {
  if (sourceType === "legacy_preorder") {
    return normalizeAdminOrderFromLegacyPreorder(record);
  }

  return normalizeAdminOrderFromOrderPlan(record);
};

export const buildProductionConfirmationMessage = (order = {}) => {
  const customerName = String(order.customerName || "").trim() || "there";
  const orderDetails = buildOrderDetailsText(order);
  const deliveryDate = formatDateOnly(getOrderSummaryDeliveryDate(order));
  const sproutEmoji = "\uD83C\uDF31";
  const sparkleEmoji = "\u2728";
  const scooterEmoji = "\uD83D\uDEF5";

  return `Hi ${customerName}! ${sproutEmoji}

Tiny update from the Good Gut Hut kitchen: production has officially started for your gut-happy lineup:

${orderDetails}

${sparkleEmoji} We are brewing, bottling, and getting everything ready for delivery on ${deliveryDate}. ${scooterEmoji}`;
};

export const sendProductionConfirmationEmail = async ({ order }) => {
  if (!order?.email) {
    return { status: "skipped" };
  }

  const deliveryDate = formatDateOnly(getOrderSummaryDeliveryDate(order));
  const itemSummaryHtml = buildOrderDetailsHtml(order);
  const text = buildProductionConfirmationMessage(order);

  await sendResendEmail({
    to: order.email,
    subject: "Your Good Gut Hut order is now in production",
    text,
    html: emailTemplate({
      eyebrow: "Production Update",
      title: "Your order is bubbling to life",
      subtitle: "A tiny kitchen update from Good Gut Hut.",
      contentHtml: `
        <p>${order.customerName ? `Hi ${escapeHtml(order.customerName)},` : "Hi,"}</p>
        <p>Production has officially started for your gut-happy lineup.</p>
        ${itemSummaryHtml ? `<h2 class="section-title">Your lineup</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
        <p>We are brewing, bottling, and getting everything ready for delivery on <strong>${escapeHtml(deliveryDate)}</strong>.</p>
      `,
      footer: `Need help? Email ${config.mailgun.supportEmail}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { status: "sent" };
};
