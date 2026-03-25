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
    timeStyle: "short",
  });
};

export const sendPreorderConfirmationEmail = async ({ preorder }) => {
  if (!preorder?.email) {
    return { skipped: true };
  }

  const deliveryDate = formatDeliveryDate(preorder.deliveryDate);
  const subject = "Thank you for your preorder with Good Gut Hut";
  const greeting = preorder.customerName
    ? `Hello ${preorder.customerName},`
    : "Hello,";
  const content = [
    `${greeting}`,
    "",
    "Thank you for your preorder. Your payment has been received and your batch is now confirmed.",
    "",
    `Delivery date: ${deliveryDate}`,
    `If you need anything before delivery, call or WhatsApp us on ${SUPPORT_PHONE}.`,
    "",
    "This email is your receipt and confirmation for the order.",
  ].join("\n");

  return sendResendEmail({
    to: preorder.email,
    subject,
    text: content,
    html: emailTemplate({
      eyebrow: "Preorder Confirmed",
      title: "Thank you for your preorder",
      subtitle: "Your Good Gut Hut batch is confirmed and we are getting it ready with care.",
      content,
      footer: `Questions before delivery? Call or WhatsApp ${SUPPORT_PHONE}, or email ${config.mailgun.supportEmail}.`,
    }),
  });
};
