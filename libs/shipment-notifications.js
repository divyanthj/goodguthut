import {
  buildPreorderShippedNotifications,
  preparePreorderShippedNotifications,
  sendPreorderShippedNotifications,
} from "@/libs/preorder-notifications";
import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";
import { formatSubscriptionDate } from "@/libs/subscription-schedule";

export {
  preparePreorderShippedNotifications,
  sendPreorderShippedNotifications,
};

export const buildPreorderShippedNotificationContent = ({ preorder }) =>
  buildPreorderShippedNotifications({ preorder });

export const sendPreorderShippedEmail = async ({ preorder }) => {
  const notifications = buildPreorderShippedNotifications({ preorder });

  if (notifications.email.status !== "pending") {
    return notifications.email;
  }

  const delivery = await sendPreorderShippedNotifications({ preorder });
  return delivery.email;
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDateTime = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatItemSummary = (items = [], separator = "\n") =>
  (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map((item) => `${Number(item.quantity || 0)} x ${item.productName || item.sku}`)
    .join(separator);

const formatItemSummaryHtml = (items = []) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map(
      (item) =>
        `<li>${escapeHtml(`${Number(item.quantity || 0)} x ${item.productName || item.sku}`)}</li>`
    )
    .join("");

export const sendOrderPlanShippedEmail = async ({ orderPlan }) => {
  if (!orderPlan?.email) {
    return { status: "skipped", reason: "missing_email" };
  }

  const trackingLink = orderPlan.shipment?.trackingLink || "";
  const estimatedArrivalAt = orderPlan.shipment?.estimatedArrivalAt || null;
  const deliveryDate = formatSubscriptionDate(
    orderPlan.nextDeliveryDate || orderPlan.firstDeliveryDate || orderPlan.startDate
  );
  const greeting = orderPlan.name ? `Hello ${orderPlan.name},` : "Hello,";
  const itemSummary = formatItemSummary(orderPlan.items);
  const itemSummaryHtml = formatItemSummaryHtml(orderPlan.items);
  const trackingLine = trackingLink
    ? `Track your order here: ${trackingLink}`
    : estimatedArrivalAt
      ? `Estimated arrival: around ${formatDateTime(estimatedArrivalAt)}.`
      : "";

  await sendResendEmail({
    to: orderPlan.email,
    subject: "Your Good Gut Hut order has been shipped",
    text: [
      greeting,
      "",
      "Your Good Gut Hut order has been shipped.",
      deliveryDate ? `Delivery date: ${deliveryDate}` : "",
      itemSummary ? `Items shipped:\n${itemSummary}` : "",
      trackingLine,
    ]
      .filter(Boolean)
      .join("\n"),
    html: emailTemplate({
      eyebrow: "Order Shipped",
      title: "Your order has been shipped",
      subtitle: trackingLink
        ? "Your Good Gut Hut order is on the way. You can track its progress below."
        : "Your Good Gut Hut order is on the way and should arrive soon.",
      contentHtml: `
        <p>${escapeHtml(greeting)}</p>
        <p>Your Good Gut Hut order has been shipped.</p>
        ${deliveryDate ? `<p><strong>Delivery date:</strong> ${escapeHtml(deliveryDate)}</p>` : ""}
        ${itemSummaryHtml ? `<h2 class="section-title">Items shipped</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
        ${
          trackingLink
            ? `<p><a href="${escapeHtml(trackingLink)}">Track your order here</a></p>`
            : estimatedArrivalAt
              ? `<p><strong>Estimated arrival:</strong> ${escapeHtml(formatDateTime(estimatedArrivalAt))}</p>`
              : ""
        }
      `,
      footer: `Need help? Call or WhatsApp +919916331569 or email ${config.mailgun.supportEmail}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { status: "sent" };
};
