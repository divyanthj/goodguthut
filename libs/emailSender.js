import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";

const SUPPORT_PHONE = "+919916331569";

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
      const unitLabel = quantity === 1 ? "unit" : "units";
      return `${quantity} ${unitLabel} of ${label}`;
    })
    .join("\n");
};

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
  const paymentBreakdown = [
    "Amount paid:",
    `Subtotal: ${formatMoney(preorder.currency, preorder.subtotal)}`,
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
    `For any questions or clarifications, WhatsApp ${SUPPORT_PHONE}. We will get back to you within 24 hours.`,
  ].filter(Boolean).join("\n");

  const footer =
    `For any questions or clarifications, WhatsApp ${SUPPORT_PHONE}. ` +
    `We will get back to you within 24 hours.`;

  return sendResendEmail({
    to: preorder.email,
    subject,
    text: content,
    html: emailTemplate({
      eyebrow: "Preorder Confirmed",
      title: "Thank you for your preorder",
      subtitle: "Your Good Gut Hut order is confirmed and we are getting it ready with care.",
      content,
      footer,
      logoUrl: `https://${config.domainName}/icon.png`,
    }),
  });
};
