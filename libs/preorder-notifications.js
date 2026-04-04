import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { sendResendEmail } from "@/libs/resend";
import { sendWhatsAppMessage } from "@/libs/whatsapp";

const SUPPORT_PHONE = "+919916331569";
const shippedWhatsappConfig = config.preorderNotifications?.shippedWhatsapp || {};
const pickupReadyWhatsappConfig = config.preorderNotifications?.pickupReadyWhatsapp || {};

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
  items
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const label = item.productName || item.name || item.sku || "Item";
      return `${label} x ${quantity}`;
    })
    .join(separator);

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

const isPickupPreorder = (preorder) => preorder?.fulfillmentMethod === "pickup";
const interpolateTemplate = (template = "", values = {}) =>
  String(template || "").replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? "");

const buildTemplateComponent = (parameters = []) => ({
  type: "body",
  parameters: parameters.map((value) => ({
    type: "text",
    text: String(value || ""),
  })),
});

const getNotificationRecord = (preorder) =>
  preorder?.notifications?.toObject?.() || preorder?.notifications || {};

const saveNotificationTimestamp = async (preorder, path) => {
  if (!preorder?.set || !preorder?.save) {
    return;
  }

  preorder.set(path, new Date());
  await preorder.save();
};

export const buildPreorderConfirmationNotifications = ({ preorder }) => {
  const isPickup = isPickupPreorder(preorder);
  const deliveryDate = formatDeliveryDate(preorder?.deliveryDate);
  const itemSummary = formatItemSummary(preorder?.items);
  const itemSummaryInline = formatItemSummary(preorder?.items, ", ");
  const itemSummaryHtml = formatItemSummaryHtml(preorder?.items);
  const totalAmount = formatMoney(preorder?.currency, preorder?.total || preorder?.payment?.amount);
  const fulfillmentLabel = isPickup ? "Pickup from" : "Delivery address";
  const fulfillmentValue = isPickup
    ? preorder?.pickupAddressSnapshot || preorder?.pickupDoorNumber || "-"
    : preorder?.normalizedDeliveryAddress || preorder?.address || "-";
  const paymentBreakdown = [
    "Amount paid:",
    `Subtotal: ${formatMoney(preorder?.currency, preorder?.subtotal)}`,
    preorder?.discount?.discountAmount > 0
      ? `Discount (${preorder.discount.code}): -${formatMoney(preorder?.currency, preorder.discount.discountAmount)}`
      : "",
    `${isPickup ? "Pickup" : "Delivery"}: ${formatMoney(preorder?.currency, preorder?.deliveryFee)}`,
    `Total: ${totalAmount}`,
  ]
    .filter(Boolean)
    .join("\n");
  const emailText = [
    preorder?.customerName ? `Hello ${preorder.customerName},` : "Hello,",
    "",
    "Thank you for your preorder. Your payment has been received and your order is confirmed.",
    "",
    `${isPickup ? "Pickup date" : "Delivery date"}: ${deliveryDate}`,
    `${fulfillmentLabel}: ${fulfillmentValue}`,
    itemSummary ? `Order details:\n${itemSummary}` : "",
    paymentBreakdown,
  ]
    .filter(Boolean)
    .join("\n");
  const notificationRecord = getNotificationRecord(preorder);

  return {
    email: preorder?.email
      ? notificationRecord.confirmationEmailSentAt
        ? { status: "already_sent" }
        : {
            status: "pending",
            subject: "Thank you for your preorder with Good Gut Hut",
            text: emailText,
            html: emailTemplate({
              eyebrow: "Preorder Confirmed",
              title: "Thank you for your preorder",
              subtitle: "Your Good Gut Hut order is confirmed and we are getting it ready with care.",
              content: emailText,
              contentHtml: `
                <p>${preorder?.customerName ? `Hello ${escapeHtml(preorder.customerName)},` : "Hello,"}</p>
                <p>Thank you for your preorder. Your payment has been received and your order is confirmed.</p>
                <p class="meta-line"><strong>${isPickup ? "Pickup date" : "Delivery date"}:</strong> ${escapeHtml(deliveryDate)}</p>
                <p class="meta-line"><strong>${escapeHtml(fulfillmentLabel)}:</strong> ${escapeHtml(fulfillmentValue)}</p>
                ${itemSummaryHtml ? `<h2 class="section-title">Order details</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
                <h2 class="section-title">Amount paid</h2>
                <table role="presentation" class="summary-table">
                  <tr>
                    <td>Subtotal</td>
                    <td>${escapeHtml(formatMoney(preorder?.currency, preorder?.subtotal))}</td>
                  </tr>
                  ${
                    preorder?.discount?.discountAmount > 0
                      ? `<tr>
                    <td>Discount (${escapeHtml(preorder.discount.code)})</td>
                    <td>-${escapeHtml(formatMoney(preorder?.currency, preorder.discount.discountAmount))}</td>
                  </tr>`
                      : ""
                  }
                  <tr>
                    <td>{isPickup ? "Pickup" : "Delivery"}</td>
                    <td>${escapeHtml(formatMoney(preorder?.currency, preorder?.deliveryFee))}</td>
                  </tr>
                  <tr class="summary-total">
                    <td>Total</td>
                    <td>${escapeHtml(totalAmount)}</td>
                  </tr>
                </table>
              `,
              footer: `For any questions or clarifications, WhatsApp us ${SUPPORT_PHONE}. We will get back to you within 24 hours.`,
              logoUrl: `https://${config.domainName}/icon.png`,
            }),
          }
      : { status: "skipped", reason: "missing_email" },
    whatsapp: preorder?.phone
      ? notificationRecord.confirmationWhatsappSentAt
        ? { status: "already_sent" }
        : {
            status: "pending",
            text: [
              "Thank you for your preorder. Your payment has been received and your order is confirmed.",
              `${isPickup ? "Pickup date" : "Delivery date"}: ${deliveryDate}`,
              `${fulfillmentLabel}: ${fulfillmentValue}`,
              itemSummaryInline ? `Order details: ${itemSummaryInline}` : "",
              `Total paid: ${totalAmount}`,
            ]
              .filter(Boolean)
              .join("\n"),
            template: process.env.WHATSAPP_PREORDER_CONFIRMATION_TEMPLATE_NAME
              ? {
                  name: process.env.WHATSAPP_PREORDER_CONFIRMATION_TEMPLATE_NAME,
                  components: [
                    buildTemplateComponent([
                      preorder?.customerName || "there",
                      deliveryDate,
                      itemSummaryInline || "Your preorder",
                      totalAmount,
                    ]),
                  ],
                }
              : null,
          }
      : { status: "skipped", reason: "missing_phone" },
  };
};

export const buildPreorderShippedNotifications = ({ preorder }) => {
  const isPickup = isPickupPreorder(preorder);
  const trackingLink = preorder?.shipment?.trackingLink || "";
  const estimatedArrivalAt = preorder?.shipment?.estimatedArrivalAt || null;
  const greeting = preorder?.customerName ? `Hello ${preorder.customerName},` : "Hello,";
  const shippedLine = isPickup
    ? "Your Good Gut Hut order is ready for pickup."
    : shippedWhatsappConfig.intro || "Your Good Gut Hut order has been shipped.";
  const itemSummary = formatItemSummary(preorder?.items);
  const itemSummaryInline = formatItemSummary(preorder?.items, ", ");
  const itemSummaryHtml = formatItemSummaryHtml(preorder?.items);
  const trackingLine = isPickup
    ? preorder?.pickupAddressSnapshot
      ? `Pickup address: ${preorder.pickupAddressSnapshot}`
      : ""
    : trackingLink
      ? `${shippedWhatsappConfig.trackingPrefix || "Track your order here:"} ${trackingLink}`
      : estimatedArrivalAt
        ? `${shippedWhatsappConfig.etaPrefix || "Estimated arrival: around"} ${formatDateTime(estimatedArrivalAt)}.`
        : "";
  const notificationRecord = getNotificationRecord(preorder);

  return {
    email: preorder?.email
      ? notificationRecord.shippedEmailSentAt
        ? { status: "already_sent" }
        : {
            status: "pending",
            subject: isPickup
              ? "Your Good Gut Hut order is ready for pickup"
              : "Your Good Gut Hut order has been shipped",
            text: [
              greeting,
              "",
              shippedLine,
              itemSummary ? `${isPickup ? "Items ready" : "Items shipped"}:\n${itemSummary}` : "",
              trackingLine,
              isPickup ? "Please let us know when you are coming to pick up the order." : "",
            ]
              .filter(Boolean)
              .join("\n"),
            html: emailTemplate({
              eyebrow: isPickup ? "Ready For Pickup" : "Order Shipped",
              title: isPickup ? "Your order is ready for pickup" : "Your order has been shipped",
              subtitle: isPickup
                ? "Your Good Gut Hut order is ready. Please let us know when you are coming to pick it up."
                : trackingLink
                  ? "Your Good Gut Hut order is on the way. You can track its progress below."
                  : "Your Good Gut Hut order is on the way and should arrive soon.",
              contentHtml: `
                <p>${escapeHtml(greeting)}</p>
                <p>${escapeHtml(shippedLine)}</p>
                ${itemSummaryHtml ? `<h2 class="section-title">${isPickup ? "Items ready" : "Items shipped"}</h2><ul class="item-list">${itemSummaryHtml}</ul>` : ""}
                ${
                  isPickup
                    ? `<p><strong>Pickup address:</strong> ${escapeHtml(preorder?.pickupAddressSnapshot || "-")}</p>
                       <p>Please let us know when you are coming to pick up the order.</p>`
                    : trackingLink
                      ? `<p><a href="${escapeHtml(trackingLink)}">Track your order here</a></p>`
                      : estimatedArrivalAt
                        ? `<p><strong>Estimated arrival:</strong> ${escapeHtml(formatDateTime(estimatedArrivalAt))}</p>`
                        : ""
                }
              `,
              footer: `Need help? Call or WhatsApp ${SUPPORT_PHONE}.`,
              logoUrl: `https://${config.domainName}/icon.png`,
            }),
          }
      : { status: "skipped", reason: "missing_email" },
    whatsapp: preorder?.phone
      ? notificationRecord.shippedWhatsappSentAt
        ? { status: "already_sent" }
        : {
            status: "pending",
            text: isPickup
              ? [
                  preorder?.pickupAddressSnapshot
                    ? interpolateTemplate(pickupReadyWhatsappConfig.withAddress, {
                        pickupAddress: preorder.pickupAddressSnapshot,
                      })
                    : pickupReadyWhatsappConfig.withoutAddress,
                ]
                  .filter(Boolean)
                  .join("\n")
              : [
                  shippedLine,
                  itemSummaryInline
                    ? `${shippedWhatsappConfig.itemsLabel || "Items"}: ${itemSummaryInline}`
                    : "",
                  trackingLine,
                ]
                  .filter(Boolean)
                  .join("\n"),
            template: !isPickup && process.env.WHATSAPP_PREORDER_SHIPPED_TEMPLATE_NAME
              ? {
                  name: process.env.WHATSAPP_PREORDER_SHIPPED_TEMPLATE_NAME,
                  components: [
                    buildTemplateComponent([
                      preorder?.customerName || "there",
                      itemSummaryInline || "Your order",
                      trackingLink || formatDateTime(estimatedArrivalAt) || "Shipping update available",
                    ]),
                  ],
                }
              : null,
          }
      : { status: "skipped", reason: "missing_phone" },
  };
};

export const sendPreorderConfirmationNotifications = async ({ preorder }) => {
  const notifications = buildPreorderConfirmationNotifications({ preorder });
  let emailDelivery = notifications.email.status === "pending" ? { status: "pending" } : notifications.email;
  let whatsappDelivery =
    notifications.whatsapp.status === "pending" ? { status: "pending" } : notifications.whatsapp;

  if (notifications.email.status === "pending") {
    await sendResendEmail({
      to: preorder.email,
      subject: notifications.email.subject,
      text: notifications.email.text,
      html: notifications.email.html,
    });
    await saveNotificationTimestamp(preorder, "notifications.confirmationEmailSentAt");
    emailDelivery = { status: "sent" };
  }

  if (notifications.whatsapp.status === "pending") {
    await sendWhatsAppMessage({
      to: preorder.phone,
      text: notifications.whatsapp.text,
      template: notifications.whatsapp.template,
    });
    await saveNotificationTimestamp(preorder, "notifications.confirmationWhatsappSentAt");
    whatsappDelivery = { status: "sent" };
  }

  return { email: emailDelivery, whatsapp: whatsappDelivery };
};

export const preparePreorderShippedNotifications = async ({ preorder }) => ({
  status: "scaffolded",
  notifications: buildPreorderShippedNotifications({ preorder }),
});

export const sendPreorderShippedNotifications = async ({ preorder }) => {
  const notifications = buildPreorderShippedNotifications({ preorder });
  let emailDelivery = notifications.email.status === "pending" ? { status: "pending" } : notifications.email;
  let whatsappDelivery =
    notifications.whatsapp.status === "pending" ? { status: "pending" } : notifications.whatsapp;

  if (notifications.email.status === "pending") {
    await sendResendEmail({
      to: preorder.email,
      subject: notifications.email.subject,
      text: notifications.email.text,
      html: notifications.email.html,
    });
    await saveNotificationTimestamp(preorder, "notifications.shippedEmailSentAt");
    emailDelivery = { status: "sent" };
  }

  if (notifications.whatsapp.status === "pending") {
    await sendWhatsAppMessage({
      to: preorder.phone,
      text: notifications.whatsapp.text,
      template: notifications.whatsapp.template,
    });
    await saveNotificationTimestamp(preorder, "notifications.shippedWhatsappSentAt");
    whatsappDelivery = { status: "sent" };
  }

  return { email: emailDelivery, whatsapp: whatsappDelivery };
};
