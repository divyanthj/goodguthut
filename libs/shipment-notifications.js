import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";

const SUPPORT_PHONE = "+919916331569";

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

const formatItemSummary = (items = []) => {
  return items
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const label = item.productName || item.name || item.sku || "Item";
      return `${label} x ${quantity}`;
    })
    .join("\n");
};

const formatItemSummaryHtml = (items = []) =>
  items
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const label = escapeHtml(item.productName || item.name || item.sku || "Item");
      return `<li>${label} <span aria-hidden="true">&times;</span> ${quantity}</li>`;
    })
    .join("");

export const buildPreorderShippedNotificationContent = ({ preorder }) => {
  const trackingLink = preorder?.shipment?.trackingLink || "";
  const estimatedArrivalAt = preorder?.shipment?.estimatedArrivalAt || null;
  const greeting = preorder?.customerName ? `Hello ${preorder.customerName},` : "Hello,";
  const shippedLine = "Your Good Gut Hut order has been shipped.";
  const itemSummary = formatItemSummary(preorder?.items);
  const itemSummaryHtml = formatItemSummaryHtml(preorder?.items);
  const trackingLine = trackingLink
    ? `Track your order here: ${trackingLink}`
    : estimatedArrivalAt
      ? `Estimated arrival: around ${formatDateTime(estimatedArrivalAt)}.`
      : "";

  const emailText = [
    greeting,
    "",
    shippedLine,
    itemSummary ? `Items shipped:\n${itemSummary}` : "",
    trackingLine,
  ].filter(Boolean).join("\n");
  const whatsappText = [shippedLine, trackingLine].filter(Boolean).join("\n");

  const emailHtml = emailTemplate({
    eyebrow: "Order Shipped",
    title: "Your order has been shipped",
    subtitle: trackingLink
      ? "Your Good Gut Hut order is on the way. You can track its progress below."
      : "Your Good Gut Hut order is on the way and should arrive soon.",
    contentHtml: `
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(shippedLine)}</p>
      ${itemSummaryHtml ? `<h2 class="section-title">Items shipped</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
      ${
        trackingLink
          ? `<p><a href="${escapeHtml(trackingLink)}">Track your order here</a></p>`
          : estimatedArrivalAt
            ? `<p><strong>Estimated arrival:</strong> ${escapeHtml(formatDateTime(estimatedArrivalAt))}</p>`
            : ""
      }
    `,
    footer: `Need help? Call or WhatsApp ${SUPPORT_PHONE}.`,
    logoUrl: `https://${config.domainName}/icon.png`,
  });

  return {
    email: preorder?.email
      ? {
          status: "pending",
          subject: "Your Good Gut Hut order has been shipped",
          text: emailText,
          html: emailHtml,
        }
      : {
          status: "skipped",
          reason: "missing_email",
        },
    whatsapp: preorder?.phone
      ? {
          status: "pending",
          message: whatsappText,
        }
      : {
          status: "skipped",
          reason: "missing_phone",
        },
  };
};

export const preparePreorderShippedNotifications = async ({ preorder }) => {
  const notifications = buildPreorderShippedNotificationContent({ preorder });

  return {
    status: "scaffolded",
    notifications,
  };
};

export const sendPreorderShippedEmail = async ({ preorder }) => {
  const notifications = buildPreorderShippedNotificationContent({ preorder });
  const emailNotification = notifications.email;

  if (emailNotification.status !== "pending") {
    return emailNotification;
  }

  await sendResendEmail({
    to: preorder.email,
    subject: emailNotification.subject,
    text: emailNotification.text,
    html: emailNotification.html,
  });

  return { status: "sent" };
};
