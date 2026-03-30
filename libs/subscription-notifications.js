import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";
import {
  buildSubscriptionEditUrl,
  createSignedSubscriptionEditToken,
} from "@/libs/subscription-edit-links";
import { formatSubscriptionCadence } from "@/libs/subscriptions";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildItemSummaryText = (items = []) =>
  items
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map((item) => `${item.productName || item.sku} x ${Number(item.quantity || 0)}`)
    .join(", ");

const buildItemSummaryHtml = (items = []) =>
  items
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map(
      (item) =>
        `<li>${escapeHtml(item.productName || item.sku)} <span aria-hidden="true">&times;</span> ${escapeHtml(
          String(Number(item.quantity || 0))
        )}</li>`
    )
    .join("");

export const sendSubscriptionEditLinkEmail = async ({
  subscription,
  subject = "Edit your Good Gut Hut subscription",
}) => {
  const token = createSignedSubscriptionEditToken({
    subscriptionId: subscription.id || subscription._id,
    email: subscription.email,
  });
  const editUrl = buildSubscriptionEditUrl(token);
  const cadenceLabel = formatSubscriptionCadence(subscription.cadence);
  const itemSummaryText = buildItemSummaryText(subscription.items || []);
  const itemSummaryHtml = buildItemSummaryHtml(subscription.items || []);

  const text = [
    subscription.name ? `Hello ${subscription.name},` : "Hello,",
    "",
    "Thank you for subscribing with Good Gut Hut.",
    "You can review or update your subscription preferences using the secure link below:",
    editUrl,
    "",
    `Cadence: ${cadenceLabel}`,
    `Delivery address: ${subscription.normalizedDeliveryAddress || subscription.address}`,
    itemSummaryText ? `Lineup: ${itemSummaryText}` : "",
    `Recurring total: ${subscription.currency || "INR"} ${Number(subscription.total || 0).toFixed(2)}`,
    "",
    "This link expires in 7 days. If it expires, you can request a fresh link from the edit page.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendResendEmail({
    to: subscription.email,
    subject,
    text,
    html: emailTemplate({
      eyebrow: "Subscription Access",
      title: "Manage your subscription",
      subtitle: "Use your secure email link to review or update your Good Gut Hut preferences.",
      contentHtml: `
        <p>${subscription.name ? `Hello ${escapeHtml(subscription.name)},` : "Hello,"}</p>
        <p>Thank you for subscribing with Good Gut Hut. Your subscription request is in, and you can update your preferences anytime using the secure link below.</p>
        <p><a href="${escapeHtml(editUrl)}">Open your subscription edit page</a></p>
        <h2 class="section-title">Current preferences</h2>
        <table role="presentation" class="summary-table">
          <tr>
            <td>Cadence</td>
            <td>${escapeHtml(cadenceLabel)}</td>
          </tr>
          <tr>
            <td>Delivery address</td>
            <td>${escapeHtml(subscription.normalizedDeliveryAddress || subscription.address || "-")}</td>
          </tr>
          <tr>
            <td>Recurring total</td>
            <td>${escapeHtml(`${subscription.currency || "INR"} ${Number(subscription.total || 0).toFixed(2)}`)}</td>
          </tr>
        </table>
        ${itemSummaryHtml ? `<h2 class="section-title">Lineup</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
        <p>This link expires in 7 days. If it expires, you can request a fresh edit link using your email address.</p>
      `,
      footer: `Need help? Email ${config.mailgun.supportEmail}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { editUrl };
};
