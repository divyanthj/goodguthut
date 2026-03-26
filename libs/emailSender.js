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

const formatDeliveryDate = (value) => {
  if (!value) {
    return "the scheduled batch date";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
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

const formatMoney = (currency = "INR", amount = 0) =>
  `${currency} ${Number(amount || 0).toFixed(2)}`;

export const sendPreorderConfirmationEmail = async ({ preorder }) => {
  if (!preorder?.email) {
    return { skipped: true };
  }

  const deliveryDate = formatDeliveryDate(preorder.deliveryDate);
  const subject = "Thank you for your preorder with Good Gut Hut";
  const greeting = preorder.customerName
    ? `Hello ${preorder.customerName},`
    : "Hello,";
  const itemSummary = formatItemSummary(preorder.items);
  const itemSummaryHtml = formatItemSummaryHtml(preorder.items);
  const paymentBreakdown = [
    "Amount paid:",
    `Subtotal: ${formatMoney(preorder.currency, preorder.subtotal)}`,
    preorder.discount?.discountAmount > 0
      ? `Discount (${preorder.discount.code}): -${formatMoney(preorder.currency, preorder.discount.discountAmount)}`
      : "",
    `Delivery: ${formatMoney(preorder.currency, preorder.deliveryFee)}`,
    `Total: ${formatMoney(preorder.currency, preorder.total || preorder.payment?.amount)}`,
  ].join("\n");
  const content = [
    `${greeting}`,
    "",
    "Thank you for your preorder. Your payment has been received and your order is confirmed.",
    "",
    `Delivery date: ${deliveryDate}`,
    itemSummary ? `Order details:\n${itemSummary}` : "",
    paymentBreakdown,
  ].filter(Boolean).join("\n");

  const footer = `For any questions or clarifications, WhatsApp us ${SUPPORT_PHONE}. We will get back to you within 24 hours.`;
  const contentHtml = `
    <p>${preorder.customerName ? `Hello ${escapeHtml(preorder.customerName)},` : "Hello,"}</p>
    <p>Thank you for your preorder. Your payment has been received and your order is confirmed.</p>
    <p class="meta-line"><strong>Delivery date:</strong> ${escapeHtml(deliveryDate)}</p>
    ${itemSummaryHtml ? `<h2 class="section-title">Order details</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
    <h2 class="section-title">Amount paid</h2>
    <table role="presentation" class="summary-table">
      <tr>
        <td>Subtotal</td>
        <td>${escapeHtml(formatMoney(preorder.currency, preorder.subtotal))}</td>
      </tr>
      ${
        preorder.discount?.discountAmount > 0
          ? `<tr>
        <td>Discount (${escapeHtml(preorder.discount.code)})</td>
        <td>-${escapeHtml(formatMoney(preorder.currency, preorder.discount.discountAmount))}</td>
      </tr>`
          : ""
      }
      <tr>
        <td>Delivery</td>
        <td>${escapeHtml(formatMoney(preorder.currency, preorder.deliveryFee))}</td>
      </tr>
      <tr class="summary-total">
        <td>Total</td>
        <td>${escapeHtml(formatMoney(preorder.currency, preorder.total || preorder.payment?.amount))}</td>
      </tr>
    </table>
  `;

  return sendResendEmail({
    to: preorder.email,
    subject,
    text: content,
    html: emailTemplate({
      eyebrow: "Preorder Confirmed",
      title: "Thank you for your preorder",
      subtitle: "Your Good Gut Hut order is confirmed and we are getting it ready with care.",
      content,
      contentHtml,
      footer,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
  });
};
