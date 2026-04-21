import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";
import { formatSubscriptionCadence, formatSubscriptionDuration } from "@/libs/subscriptions";
import { formatSubscriptionDate } from "@/libs/subscription-schedule";

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

export const sendOrderPlanConfirmationEmail = async ({ orderPlan }) => {
  if (!orderPlan?.email) {
    return { status: "skipped" };
  }

  const isRecurring = orderPlan.mode === "recurring";
  const firstDeliveryLabel = formatSubscriptionDate(
    orderPlan.firstDeliveryDate || orderPlan.startDate
  );
  const nextDeliveryLabel = formatSubscriptionDate(orderPlan.nextDeliveryDate);
  const itemSummaryText = buildItemSummaryText(orderPlan.items || []);
  const itemSummaryHtml = buildItemSummaryHtml(orderPlan.items || []);
  const cadenceLabel = isRecurring
    ? formatSubscriptionCadence(orderPlan.cadence)
    : "One-time";
  const durationLabel = isRecurring
    ? formatSubscriptionDuration(orderPlan.durationWeeks)
    : "Single delivery";

  const text = [
    orderPlan.name ? `Hello ${orderPlan.name},` : "Hello,",
    "",
    "Thank you for ordering from Good Gut Hut.",
    isRecurring
      ? "Your recurring plan is confirmed."
      : "Your one-time order has been confirmed.",
    "",
    `Mode: ${isRecurring ? "Recurring" : "One-time"}`,
    `How often: ${cadenceLabel}`,
    `How long: ${durationLabel}`,
    firstDeliveryLabel ? `First delivery: ${firstDeliveryLabel}` : "",
    isRecurring && nextDeliveryLabel ? `Next delivery: ${nextDeliveryLabel}` : "",
    `Delivery address: ${orderPlan.normalizedDeliveryAddress || orderPlan.address}`,
    itemSummaryText ? `Lineup: ${itemSummaryText}` : "",
    `Total: ${orderPlan.currency || "INR"} ${Number(orderPlan.total || 0).toFixed(2)}`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendResendEmail({
    to: orderPlan.email,
    subject: isRecurring
      ? "Your Good Gut Hut recurring plan is confirmed"
      : "Your Good Gut Hut order is confirmed",
    text,
    html: emailTemplate({
      eyebrow: "Order Confirmation",
      title: isRecurring
        ? "Your recurring plan is confirmed"
        : "Your one-time order is confirmed",
      subtitle: "Thanks for choosing Good Gut Hut.",
      contentHtml: `
        <p>${orderPlan.name ? `Hello ${escapeHtml(orderPlan.name)},` : "Hello,"}</p>
        <p>${isRecurring ? "Your recurring plan is active." : "Your one-time order has been confirmed and paid."}</p>
        <h2 class="section-title">Your order summary</h2>
        <table role="presentation" class="summary-table">
          <tr><td>Mode</td><td>${isRecurring ? "Recurring" : "One-time"}</td></tr>
          <tr><td>How often</td><td>${escapeHtml(cadenceLabel)}</td></tr>
          <tr><td>How long</td><td>${escapeHtml(durationLabel)}</td></tr>
          <tr><td>First delivery</td><td>${escapeHtml(firstDeliveryLabel || "-")}</td></tr>
          ${isRecurring ? `<tr><td>Next delivery</td><td>${escapeHtml(nextDeliveryLabel || "-")}</td></tr>` : ""}
          <tr><td>Delivery address</td><td>${escapeHtml(orderPlan.normalizedDeliveryAddress || orderPlan.address || "-")}</td></tr>
          <tr><td>Total</td><td>${escapeHtml(`${orderPlan.currency || "INR"} ${Number(orderPlan.total || 0).toFixed(2)}`)}</td></tr>
        </table>
        ${itemSummaryHtml ? `<h2 class="section-title">What&apos;s in your set</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
      `,
      footer: `Need help? Email ${config.mailgun.supportEmail}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { status: "sent" };
};

