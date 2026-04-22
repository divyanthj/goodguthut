import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";
import {
  buildSubscriptionEditUrl,
  createSignedSubscriptionEditToken,
} from "@/libs/subscription-edit-links";
import {
  formatSubscriptionCadence,
  formatSubscriptionDuration,
} from "@/libs/subscriptions";
import { formatDeliveryDaysOfWeek } from "@/libs/subscription-delivery-days";
import {
  formatMinimumLeadDays,
  formatSubscriptionDate,
} from "@/libs/subscription-schedule";

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
  subject = "Manage your Good Gut Hut plan",
}) => {
  const token = createSignedSubscriptionEditToken({
    subscriptionId: subscription.id || subscription._id,
    email: subscription.email,
  });
  const editUrl = buildSubscriptionEditUrl(token);
  const cadenceLabel = formatSubscriptionCadence(subscription.cadence);
  const durationLabel = formatSubscriptionDuration(subscription.durationWeeks);
  const deliveryDaysLabel = formatDeliveryDaysOfWeek(subscription.deliveryDaysOfWeek || []);
  const firstDeliveryLabel = formatSubscriptionDate(
    subscription.firstDeliveryDate || subscription.startDate
  );
  const nextDeliveryLabel = formatSubscriptionDate(subscription.nextDeliveryDate);
  const itemSummaryText = buildItemSummaryText(subscription.items || []);
  const itemSummaryHtml = buildItemSummaryHtml(subscription.items || []);

  const text = [
    subscription.name ? `Hello ${subscription.name},` : "Hello,",
    "",
    "Thank you for subscribing with Good Gut Hut.",
    "You can review or update your plan using the secure link below:",
    editUrl,
    "",
    `How often: ${cadenceLabel}`,
    `How long: ${durationLabel}`,
    subscription.comboName ? `Your set: ${subscription.comboName}` : "Your set: Build your own",
    `Delivery days: ${deliveryDaysLabel}`,
    firstDeliveryLabel ? `First delivery: ${firstDeliveryLabel}` : "",
    nextDeliveryLabel ? `Next delivery: ${nextDeliveryLabel}` : "",
    `Minimum notice: ${formatMinimumLeadDays(subscription.minimumLeadDays || 0)}`,
    `Delivery address: ${subscription.normalizedDeliveryAddress || subscription.address}`,
    itemSummaryText ? `Lineup: ${itemSummaryText}` : "",
    `Recurring total: ${subscription.currency || "INR"} ${Number(subscription.total || 0).toFixed(2)}`,
    "",
    "This link expires in 7 days. If it expires, you can request a fresh one from the manage-plan page.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendResendEmail({
    to: subscription.email,
    subject,
    text,
    html: emailTemplate({
      eyebrow: "Manage Your Plan",
      title: "Update your Good Gut Hut plan",
      subtitle: "Use your secure email link to review or update your delivery preferences.",
      contentHtml: `
        <p>${subscription.name ? `Hello ${escapeHtml(subscription.name)},` : "Hello,"}</p>
        <p>Thank you for choosing Good Gut Hut. You can update your plan anytime using the secure link below.</p>
        <p><a href="${escapeHtml(editUrl)}">Open your plan page</a></p>
        <h2 class="section-title">Your current plan</h2>
        <table role="presentation" class="summary-table">
          <tr>
            <td>How often</td>
            <td>${escapeHtml(cadenceLabel)}</td>
          </tr>
          <tr>
            <td>How long</td>
            <td>${escapeHtml(durationLabel)}</td>
          </tr>
          <tr>
            <td>Your set</td>
            <td>${escapeHtml(subscription.comboName || "Build your own")}</td>
          </tr>
          <tr>
            <td>Delivery days</td>
            <td>${escapeHtml(deliveryDaysLabel)}</td>
          </tr>
          <tr>
            <td>First delivery</td>
            <td>${escapeHtml(firstDeliveryLabel || "-")}</td>
          </tr>
          <tr>
            <td>Next delivery</td>
            <td>${escapeHtml(nextDeliveryLabel || "-")}</td>
          </tr>
          <tr>
            <td>Minimum notice</td>
            <td>${escapeHtml(formatMinimumLeadDays(subscription.minimumLeadDays || 0))}</td>
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
        ${itemSummaryHtml ? `<h2 class="section-title">What's in your set</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
        <p>This link expires in 7 days. If it expires, you can request a fresh one using your email address.</p>
      `,
      footer: `Need help? Email ${config.mailgun.supportEmail}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { editUrl };
};

