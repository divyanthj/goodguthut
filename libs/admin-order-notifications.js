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

const formatMoney = (currency = "INR", amount = 0) =>
  `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`;

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

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

const getAdminOrderNotificationRecipients = () => {
  const configured = String(process.env.ADMIN_ORDER_NOTIFICATION_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  return [config.mailgun.supportEmail].filter(Boolean);
};

const buildOrderPlanAdminEmail = (orderPlan) => {
  const isRecurring = orderPlan?.mode === "recurring";
  const itemSummaryText = buildItemSummaryText(orderPlan?.items);
  const itemSummaryHtml = buildItemSummaryHtml(orderPlan?.items);
  const cadenceLabel = isRecurring
    ? formatSubscriptionCadence(orderPlan?.cadence)
    : "One-time";
  const durationLabel = isRecurring
    ? formatSubscriptionDuration(orderPlan?.durationWeeks)
    : "Single delivery";
  const orderNumber = orderPlan?.orderNumber || String(orderPlan?.id || orderPlan?._id || "").trim();
  const subject = isRecurring
    ? `Admin: payment confirmed for recurring order ${orderNumber}`
    : `Admin: payment confirmed for order ${orderNumber}`;
  const text = [
    "A customer order has been paid and confirmed.",
    "",
    `Order number: ${orderNumber}`,
    `Type: ${isRecurring ? "Recurring order" : "One-time order"}`,
    `Customer: ${orderPlan?.name || "-"}`,
    `Email: ${orderPlan?.email || "-"}`,
    `Phone: ${orderPlan?.phone || "-"}`,
    `Paid at: ${formatDate(orderPlan?.payment?.paidAt || orderPlan?.updatedAt || new Date())}`,
    `First delivery: ${formatSubscriptionDate(orderPlan?.firstDeliveryDate || orderPlan?.startDate) || "-"}`,
    isRecurring ? `Next delivery: ${formatSubscriptionDate(orderPlan?.nextDeliveryDate) || "-"}` : "",
    `How often: ${cadenceLabel}`,
    `How long: ${durationLabel}`,
    `Address: ${orderPlan?.normalizedDeliveryAddress || orderPlan?.address || "-"}`,
    itemSummaryText ? `Items: ${itemSummaryText}` : "",
    `Total: ${formatMoney(orderPlan?.currency, orderPlan?.total)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    text,
    html: emailTemplate({
      eyebrow: "Admin Order Alert",
      title: "Payment confirmed for a customer order",
      subtitle: `${escapeHtml(orderNumber)} is ready for admin follow-up.`,
      contentHtml: `
        <p>A customer order has been paid and confirmed.</p>
        <table role="presentation" class="summary-table">
          <tr><td>Order number</td><td>${escapeHtml(orderNumber)}</td></tr>
          <tr><td>Type</td><td>${escapeHtml(isRecurring ? "Recurring order" : "One-time order")}</td></tr>
          <tr><td>Customer</td><td>${escapeHtml(orderPlan?.name || "-")}</td></tr>
          <tr><td>Email</td><td>${escapeHtml(orderPlan?.email || "-")}</td></tr>
          <tr><td>Phone</td><td>${escapeHtml(orderPlan?.phone || "-")}</td></tr>
          <tr><td>Paid at</td><td>${escapeHtml(formatDate(orderPlan?.payment?.paidAt || orderPlan?.updatedAt || new Date()))}</td></tr>
          <tr><td>First delivery</td><td>${escapeHtml(formatSubscriptionDate(orderPlan?.firstDeliveryDate || orderPlan?.startDate) || "-")}</td></tr>
          ${isRecurring ? `<tr><td>Next delivery</td><td>${escapeHtml(formatSubscriptionDate(orderPlan?.nextDeliveryDate) || "-")}</td></tr>` : ""}
          <tr><td>How often</td><td>${escapeHtml(cadenceLabel)}</td></tr>
          <tr><td>How long</td><td>${escapeHtml(durationLabel)}</td></tr>
          <tr><td>Address</td><td>${escapeHtml(orderPlan?.normalizedDeliveryAddress || orderPlan?.address || "-")}</td></tr>
          <tr><td>Total</td><td>${escapeHtml(formatMoney(orderPlan?.currency, orderPlan?.total))}</td></tr>
        </table>
        ${itemSummaryHtml ? `<h2 class="section-title">Items</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
      `,
      footer: `Admin notifications for ${config.appName}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
  };
};

const buildPreorderAdminEmail = (preorder) => {
  const isPickup = preorder?.fulfillmentMethod === "pickup";
  const itemSummaryText = buildItemSummaryText(preorder?.items);
  const itemSummaryHtml = buildItemSummaryHtml(preorder?.items);
  const orderNumber = preorder?.orderNumber || String(preorder?.id || preorder?._id || "").trim();
  const subject = `Admin: payment confirmed for preorder ${orderNumber}`;
  const text = [
    "A customer preorder has been paid and confirmed.",
    "",
    `Order number: ${orderNumber}`,
    `Type: ${isPickup ? "Pickup preorder" : "Delivery preorder"}`,
    `Customer: ${preorder?.customerName || "-"}`,
    `Email: ${preorder?.email || "-"}`,
    `Phone: ${preorder?.phone || "-"}`,
    `Paid at: ${formatDate(preorder?.payment?.paidAt || preorder?.updatedAt || new Date())}`,
    `Delivery date: ${formatDate(preorder?.deliveryDate)}`,
    `Batch: ${preorder?.preorderWindowLabel || "-"}`,
    `${isPickup ? "Pickup address" : "Address"}: ${
      preorder?.pickupAddressSnapshot ||
      preorder?.normalizedDeliveryAddress ||
      preorder?.address ||
      "-"
    }`,
    itemSummaryText ? `Items: ${itemSummaryText}` : "",
    `Total: ${formatMoney(preorder?.currency, preorder?.total)}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    text,
    html: emailTemplate({
      eyebrow: "Admin Order Alert",
      title: "Payment confirmed for a preorder",
      subtitle: `${escapeHtml(orderNumber)} is ready for admin follow-up.`,
      contentHtml: `
        <p>A customer preorder has been paid and confirmed.</p>
        <table role="presentation" class="summary-table">
          <tr><td>Order number</td><td>${escapeHtml(orderNumber)}</td></tr>
          <tr><td>Type</td><td>${escapeHtml(isPickup ? "Pickup preorder" : "Delivery preorder")}</td></tr>
          <tr><td>Customer</td><td>${escapeHtml(preorder?.customerName || "-")}</td></tr>
          <tr><td>Email</td><td>${escapeHtml(preorder?.email || "-")}</td></tr>
          <tr><td>Phone</td><td>${escapeHtml(preorder?.phone || "-")}</td></tr>
          <tr><td>Paid at</td><td>${escapeHtml(formatDate(preorder?.payment?.paidAt || preorder?.updatedAt || new Date()))}</td></tr>
          <tr><td>Delivery date</td><td>${escapeHtml(formatDate(preorder?.deliveryDate))}</td></tr>
          <tr><td>Batch</td><td>${escapeHtml(preorder?.preorderWindowLabel || "-")}</td></tr>
          <tr><td>${escapeHtml(isPickup ? "Pickup address" : "Address")}</td><td>${escapeHtml(
            preorder?.pickupAddressSnapshot ||
              preorder?.normalizedDeliveryAddress ||
              preorder?.address ||
              "-"
          )}</td></tr>
          <tr><td>Total</td><td>${escapeHtml(formatMoney(preorder?.currency, preorder?.total))}</td></tr>
        </table>
        ${itemSummaryHtml ? `<h2 class="section-title">Items</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
      `,
      footer: `Admin notifications for ${config.appName}.`,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
  };
};

export const sendAdminOrderPlanConfirmedEmail = async ({ orderPlan }) => {
  const recipients = getAdminOrderNotificationRecipients();

  if (recipients.length === 0) {
    return { status: "skipped", reason: "missing_admin_recipients" };
  }

  const email = buildOrderPlanAdminEmail(orderPlan);

  await sendResendEmail({
    to: recipients,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { status: "sent", recipients };
};

export const sendAdminPreorderConfirmedEmail = async ({ preorder }) => {
  const recipients = getAdminOrderNotificationRecipients();

  if (recipients.length === 0) {
    return { status: "skipped", reason: "missing_admin_recipients" };
  }

  const email = buildPreorderAdminEmail(preorder);

  await sendResendEmail({
    to: recipients,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: config.mailgun.forwardRepliesTo,
  });

  return { status: "sent", recipients };
};
