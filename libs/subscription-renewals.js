import config from "@/config";
import connectMongo from "@/libs/mongoose";
import OrderPlan from "@/models/OrderPlan";
import { sendResendEmail } from "@/libs/resend";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export const sendDueSubscriptionRenewals = async ({ now = new Date() } = {}) => {
  await connectMongo();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + 3);
  const staleClaim = new Date(now.getTime() - 15 * 60 * 1000);
  const filter = {
    mode: "recurring", paymentType: "one_time", "payment.status": "paid",
    status: { $in: ["active", "shipped", "fulfilled"] },
    email: { $ne: "" }, subscriptionEndDate: { $gte: today, $lte: cutoff.toISOString().slice(0, 10) },
    "notifications.renewalEmailSentAt": null,
    $or: [{ "notifications.renewalEmailClaimedAt": null }, { "notifications.renewalEmailClaimedAt": { $lt: staleClaim } }],
  };
  const candidates = await OrderPlan.find(filter).select("_id").limit(100).lean();
  let sent = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const order = await OrderPlan.findOneAndUpdate({ ...filter, _id: candidate._id }, { $set: { "notifications.renewalEmailClaimedAt": now } }, { new: true });
    if (!order) continue;
    try {
      const renewUrl = `${process.env.SITE_URL || `https://${config.domainName}`}/?subscription=1#order-flow`;
      const text = `Hello ${order.name},\n\nYour Good Gut Hut subscription ends on ${order.subscriptionEndDate}. Keep your weekly kanji deliveries going by choosing a new subscription: ${renewUrl}\n\nRenewal is optional. You will only pay when you place a new order; there are no automatic charges.`;
      await sendResendEmail({
        to: order.email, subject: "Ready for your next kanji subscription?", text,
        html: `<p>Hello ${escapeHtml(order.name)},</p><p>Your Good Gut Hut subscription ends on ${escapeHtml(order.subscriptionEndDate)}.</p><p><a href="${escapeHtml(renewUrl)}">Choose your next subscription</a> to keep your weekly kanji deliveries going.</p><p>Renewal is optional. You will only pay when you place a new order; there are no automatic charges.</p>`,
        replyTo: config.mailgun.forwardRepliesTo,
        idempotencyKey: `subscription-renewal-${order.id}`,
      });
      await OrderPlan.updateOne({ _id: order._id }, { $set: { "notifications.renewalEmailSentAt": now }, $unset: { "notifications.renewalEmailClaimedAt": "" } });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Failed to send subscription renewal", order.id, error.message);
      await OrderPlan.updateOne({ _id: order._id, "notifications.renewalEmailClaimedAt": now }, { $unset: { "notifications.renewalEmailClaimedAt": "" } });
    }
  }
  return { sent, failed };
};
