import config from "@/config";
import { emailTemplate } from "@/libs/emailTemplate";
import { getInvoiceSettings } from "@/libs/invoice-settings";
import connectMongo from "@/libs/mongoose";
import { sendResendEmail } from "@/libs/resend";
import Invoice from "@/models/Invoice";
import InvoiceCounter from "@/models/InvoiceCounter";
import OrderPlan from "@/models/OrderPlan";
import Sku from "@/models/Sku";
import Subscription from "@/models/Subscription";

export const INVOICE_SELLER_NAME = "The Living Element LLP";
const GST_NOT_APPLICABLE_TEXT =
  "GST not applicable as supplier is not registered under GST (Section 22).";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toDateKey = (value = new Date()) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
  });
};

const formatMoney = (currency = "INR", amount = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatAddressParts = (...parts) =>
  parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

const roundMoney = (value = 0) => Math.round(Number(value || 0) * 100) / 100;

const normalizeStateCode = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\D/g, "")
    .slice(0, 2);

const INDIAN_STATE_CODES = [
  ["andhra pradesh", "37"],
  ["arunachal pradesh", "12"],
  ["assam", "18"],
  ["bihar", "10"],
  ["chhattisgarh", "22"],
  ["delhi", "07"],
  ["goa", "30"],
  ["gujarat", "24"],
  ["haryana", "06"],
  ["himachal pradesh", "02"],
  ["jharkhand", "20"],
  ["karnataka", "29"],
  ["kerala", "32"],
  ["madhya pradesh", "23"],
  ["maharashtra", "27"],
  ["manipur", "14"],
  ["meghalaya", "17"],
  ["mizoram", "15"],
  ["nagaland", "13"],
  ["odisha", "21"],
  ["punjab", "03"],
  ["rajasthan", "08"],
  ["sikkim", "11"],
  ["tamil nadu", "33"],
  ["telangana", "36"],
  ["tripura", "16"],
  ["uttar pradesh", "09"],
  ["uttarakhand", "05"],
  ["west bengal", "19"],
];

const inferIndianStateFromAddress = (address = "") => {
  const normalized = String(address || "").toLowerCase();
  const match = INDIAN_STATE_CODES.find(([state]) => normalized.includes(state));

  return match ? { state: match[0].replace(/\b\w/g, (char) => char.toUpperCase()), stateCode: match[1] } : {};
};

const getGstTreatment = ({ sellerGstin = "", sellerStateCode = "", customerStateCode = "" }) => {
  if (!sellerGstin) {
    return "not_configured";
  }

  const sellerCode = normalizeStateCode(sellerStateCode);
  const customerCode = normalizeStateCode(customerStateCode);

  if (!sellerCode || !customerCode) {
    return "unknown_place";
  }

  return sellerCode === customerCode ? "intra_state" : "inter_state";
};

const calculateTaxAmounts = ({ taxableAmount = 0, gstRate = 0, gstTreatment = "not_configured" }) => {
  const taxable = roundMoney(taxableAmount);
  const rate = Math.max(0, Number(gstRate || 0));

  if (taxable <= 0 || rate <= 0 || gstTreatment === "not_configured" || gstTreatment === "unknown_place") {
    return {
      taxableAmount: taxable,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
    };
  }

  if (gstTreatment === "intra_state") {
    const halfTax = roundMoney((taxable * rate) / 100 / 2);

    return {
      taxableAmount: taxable,
      cgstAmount: halfTax,
      sgstAmount: halfTax,
      igstAmount: 0,
    };
  }

  return {
    taxableAmount: taxable,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: roundMoney((taxable * rate) / 100),
  };
};

const normalizeItems = ({ items = [], skuMap = new Map(), gstTreatment = "not_configured" } = {}) =>
  (Array.isArray(items) ? items : [])
    .filter((item) => Number(item?.quantity || 0) > 0)
    .map((item) => {
      const sku = String(item.sku || "").trim().toUpperCase();
      const skuConfig = skuMap.get(sku) || {};
      const lineTotal = roundMoney(
        item.lineTotal || Number(item.unitPrice || 0) * Number(item.quantity || 0)
      );
      const tax = calculateTaxAmounts({
        taxableAmount: lineTotal,
        gstRate: skuConfig.gstRate || item.gstRate || 0,
        gstTreatment,
      });

      return {
        sku,
        productName: String(item.productName || item.name || item.sku || "Item").trim(),
        quantity: Number(item.quantity || 0),
        unitPrice: roundMoney(item.unitPrice || 0),
        lineTotal,
        hsnCode: String(skuConfig.hsnCode || item.hsnCode || "").trim(),
        gstRate: Number(skuConfig.gstRate || item.gstRate || 0),
        ...tax,
      };
    });

const getNextInvoiceNumber = async (date = new Date()) => {
  const year = new Date(date).getFullYear();
  const key = `TLE-${year}`;
  const counter = await InvoiceCounter.findOneAndUpdate(
    { key },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return `${key}-${String(counter.sequence).padStart(4, "0")}`;
};

const buildInvoiceHtml = (invoice) => {
  const isGstReadySnapshot = Number(invoice.snapshotVersion || 1) >= 2;
  const seller = invoice.seller || {};
  const taxSummary = invoice.taxSummary || {};
  const deliveryTax = invoice.deliveryTax || {};
  const taxTotal = Number(taxSummary.totalTaxAmount || 0);
  const grandTotal = Number(invoice.grandTotal || invoice.total || 0);
  const gstStatusLine = seller.gstin
    ? `GSTIN: ${escapeHtml(seller.gstin)}`
    : GST_NOT_APPLICABLE_TEXT;
  const sellerAddress = formatAddressParts(seller.addressLine2, seller.address);
  const itemRows = (invoice.items || [])
    .map(
      (item) =>
        isGstReadySnapshot
          ? `<tr>
        <td>
          <strong>${escapeHtml(item.productName || "Item")}</strong>
          ${item.sku ? `<div style="font-size:12px;color:#6b7d74;">${escapeHtml(item.sku)}</div>` : ""}
        </td>
        <td>${escapeHtml(item.hsnCode || "-")}</td>
        <td>${escapeHtml(String(Number(item.quantity || 0)))}</td>
        <td>${escapeHtml(formatMoney(invoice.currency, item.unitPrice))}</td>
        <td>${escapeHtml(formatMoney(invoice.currency, item.taxableAmount || item.lineTotal))}</td>
        <td>${escapeHtml(`${Number(item.gstRate || 0)}%`)}</td>
        <td>${escapeHtml(formatMoney(invoice.currency, Number(item.cgstAmount || 0) + Number(item.sgstAmount || 0) + Number(item.igstAmount || 0)))}</td>
        <td>${escapeHtml(formatMoney(invoice.currency, Number(item.taxableAmount || item.lineTotal) + Number(item.cgstAmount || 0) + Number(item.sgstAmount || 0) + Number(item.igstAmount || 0)))}</td>
      </tr>`
          : `<tr>
        <td>
          <strong>${escapeHtml(item.productName || "Item")}</strong>
          ${item.sku ? `<div style="font-size:12px;color:#6b7d74;">${escapeHtml(item.sku)}</div>` : ""}
        </td>
        <td>${escapeHtml(String(Number(item.quantity || 0)))}</td>
        <td>${escapeHtml(formatMoney(invoice.currency, item.unitPrice))}</td>
        <td>${escapeHtml(formatMoney(invoice.currency, item.lineTotal))}</td>
      </tr>`
    )
    .join("");

  return emailTemplate({
    eyebrow: invoice.invoiceLabel || "Invoice",
    title: invoice.invoiceLabel || "Invoice",
    subtitle: `${invoice.invoiceLabel || "Invoice"} ${invoice.invoiceNumber} from ${
      seller.legalName || invoice.sellerName || INVOICE_SELLER_NAME
    }`,
    contentHtml: `
      <p>${invoice.customer?.name ? `Hello ${escapeHtml(invoice.customer.name)},` : "Hello,"}</p>
      <p>Your invoice for the delivered order is below.</p>
      <table role="presentation" class="summary-table">
        <tr><td>Seller</td><td>${escapeHtml(seller.legalName || invoice.sellerName || INVOICE_SELLER_NAME)}</td></tr>
        ${sellerAddress ? `<tr><td>Seller address</td><td>${escapeHtml(sellerAddress)}</td></tr>` : ""}
        ${seller.state || seller.stateCode ? `<tr><td>Seller state</td><td>${escapeHtml([seller.state, seller.stateCode].filter(Boolean).join(" - "))}</td></tr>` : ""}
        <tr><td>GST status</td><td>${gstStatusLine}</td></tr>
        <tr><td>Invoice date</td><td>${escapeHtml(formatDate(invoice.invoiceDate))}</td></tr>
        <tr><td>Delivered on</td><td>${escapeHtml(formatDate(invoice.deliveredAt))}</td></tr>
        <tr><td>Invoice number</td><td>${escapeHtml(invoice.invoiceNumber)}</td></tr>
        ${
          isGstReadySnapshot
            ? `<tr><td>Place of supply</td><td>${escapeHtml(taxSummary.placeOfSupply || "Not captured")}</td></tr>`
            : ""
        }
      </table>
      <h2 class="section-title">Bill to</h2>
      <p class="meta-line">
        <strong>${escapeHtml(invoice.customer?.name || "-")}</strong><br />
        ${escapeHtml(invoice.customer?.email || "")}
        ${invoice.customer?.phone ? `<br />${escapeHtml(invoice.customer.phone)}` : ""}
        ${invoice.customer?.address ? `<br />${escapeHtml(invoice.customer.address)}` : ""}
      </p>
      <h2 class="section-title">Items</h2>
      <table role="presentation" class="summary-table">
        ${
          isGstReadySnapshot
            ? `<tr>
          <td><strong>Item</strong></td>
          <td><strong>HSN</strong></td>
          <td><strong>Qty</strong></td>
          <td><strong>Rate</strong></td>
          <td><strong>Taxable</strong></td>
          <td><strong>GST</strong></td>
          <td><strong>Tax</strong></td>
          <td><strong>Total</strong></td>
        </tr>`
            : `<tr>
          <td><strong>Item</strong></td>
          <td><strong>Qty</strong></td>
          <td><strong>Rate</strong></td>
          <td><strong>Amount</strong></td>
        </tr>`
        }
        ${itemRows}
      </table>
      <h2 class="section-title">Summary</h2>
      <table role="presentation" class="summary-table">
        <tr><td>Subtotal</td><td>${escapeHtml(formatMoney(invoice.currency, invoice.subtotal))}</td></tr>
        ${
          Number(invoice.discountAmount || 0) > 0
            ? `<tr><td>Discount</td><td>-${escapeHtml(formatMoney(invoice.currency, invoice.discountAmount))}</td></tr>`
            : ""
        }
        ${
          isGstReadySnapshot
            ? `<tr><td>Delivery (${escapeHtml(deliveryTax.hsnSac || "HSN/SAC not set")}, GST ${escapeHtml(String(Number(deliveryTax.gstRate || 0)))}%)</td><td>${escapeHtml(formatMoney(invoice.currency, invoice.deliveryFee))}</td></tr>
        <tr><td>CGST</td><td>${escapeHtml(formatMoney(invoice.currency, taxSummary.cgstAmount))}</td></tr>
        <tr><td>SGST</td><td>${escapeHtml(formatMoney(invoice.currency, taxSummary.sgstAmount))}</td></tr>
        <tr><td>IGST</td><td>${escapeHtml(formatMoney(invoice.currency, taxSummary.igstAmount))}</td></tr>
        <tr><td>Total tax</td><td>${escapeHtml(formatMoney(invoice.currency, taxTotal))}</td></tr>
        <tr class="summary-total"><td>Grand total</td><td>${escapeHtml(formatMoney(invoice.currency, grandTotal))}</td></tr>`
            : `<tr><td>Delivery</td><td>${escapeHtml(formatMoney(invoice.currency, invoice.deliveryFee))}</td></tr>
        <tr class="summary-total"><td>Total</td><td>${escapeHtml(formatMoney(invoice.currency, invoice.total))}</td></tr>`
        }
      </table>
      ${
        isGstReadySnapshot && taxSummary.gstTreatment === "unknown_place"
          ? `<p>GST was not calculated because place of supply details are incomplete.</p>`
          : ""
      }
    `,
    footer: invoice.computerGeneratedText || `Need help? Email ${config.mailgun.supportEmail}.`,
    logoUrl: `https://${config.domainName}/icon.png`,
  });
};

const buildInvoiceText = (invoice) =>
  {
    const isGstReadySnapshot = Number(invoice.snapshotVersion || 1) >= 2;
    const seller = invoice.seller || {};
    const taxSummary = invoice.taxSummary || {};
    const deliveryTax = invoice.deliveryTax || {};
    return [
    `${invoice.invoiceLabel || "Invoice"} ${invoice.invoiceNumber}`,
    `Seller: ${seller.legalName || invoice.sellerName || INVOICE_SELLER_NAME}`,
    formatAddressParts(seller.addressLine2, seller.address)
      ? `Seller address: ${formatAddressParts(seller.addressLine2, seller.address)}`
      : "",
    seller.state || seller.stateCode
      ? `Seller state: ${[seller.state, seller.stateCode].filter(Boolean).join(" - ")}`
      : "",
    seller.gstin ? `GSTIN: ${seller.gstin}` : GST_NOT_APPLICABLE_TEXT,
    `Invoice date: ${formatDate(invoice.invoiceDate)}`,
    `Delivered on: ${formatDate(invoice.deliveredAt)}`,
    isGstReadySnapshot ? `Place of supply: ${taxSummary.placeOfSupply || "Not captured"}` : "",
    "",
    `Bill to: ${invoice.customer?.name || "-"}`,
    invoice.customer?.email || "",
    invoice.customer?.phone || "",
    invoice.customer?.address || "",
    "",
    "Items:",
    ...(invoice.items || []).map(
      (item) =>
        isGstReadySnapshot
          ? `${item.productName} x ${Number(item.quantity || 0)} | HSN ${item.hsnCode || "-"} | GST ${Number(item.gstRate || 0)}% | Taxable ${formatMoney(invoice.currency, item.taxableAmount || item.lineTotal)} | Tax ${formatMoney(invoice.currency, Number(item.cgstAmount || 0) + Number(item.sgstAmount || 0) + Number(item.igstAmount || 0))}`
          : `${item.productName} x ${Number(item.quantity || 0)} - ${formatMoney(invoice.currency, item.lineTotal)}`
    ),
    "",
    `Subtotal: ${formatMoney(invoice.currency, invoice.subtotal)}`,
    Number(invoice.discountAmount || 0) > 0
      ? `Discount: -${formatMoney(invoice.currency, invoice.discountAmount)}`
      : "",
    isGstReadySnapshot
      ? `Delivery (${deliveryTax.hsnSac || "HSN/SAC not set"}, GST ${Number(deliveryTax.gstRate || 0)}%): ${formatMoney(invoice.currency, invoice.deliveryFee)}`
      : `Delivery: ${formatMoney(invoice.currency, invoice.deliveryFee)}`,
    isGstReadySnapshot ? `CGST: ${formatMoney(invoice.currency, taxSummary.cgstAmount)}` : "",
    isGstReadySnapshot ? `SGST: ${formatMoney(invoice.currency, taxSummary.sgstAmount)}` : "",
    isGstReadySnapshot ? `IGST: ${formatMoney(invoice.currency, taxSummary.igstAmount)}` : "",
    isGstReadySnapshot ? `Total tax: ${formatMoney(invoice.currency, taxSummary.totalTaxAmount)}` : "",
    `Total: ${formatMoney(invoice.currency, invoice.grandTotal || invoice.total)}`,
    invoice.computerGeneratedText || "",
  ]
    .filter(Boolean)
    .join("\n");
  };

export const sendInvoiceEmail = async ({ invoice }) => {
  if (!invoice?.customer?.email) {
    invoice.emailStatus = "skipped";
    invoice.emailError = "Missing customer email.";
    invoice.emailLastAttemptAt = new Date();
    await invoice.save();
    return { status: "skipped", reason: "missing_email" };
  }

  invoice.emailLastAttemptAt = new Date();

  try {
    await sendResendEmail({
      to: invoice.customer.email,
      subject: `${invoice.invoiceLabel || "Invoice"} ${invoice.invoiceNumber} from ${
        invoice.seller?.legalName || invoice.sellerName || INVOICE_SELLER_NAME
      }`,
      text: buildInvoiceText(invoice),
      html: buildInvoiceHtml(invoice),
      replyTo: config.mailgun.forwardRepliesTo,
    });

    invoice.emailStatus = "sent";
    invoice.emailSentAt = new Date();
    invoice.emailError = "";
    await invoice.save();
    return { status: "sent" };
  } catch (error) {
    invoice.emailStatus = "failed";
    invoice.emailError = error.message || "Could not send invoice email.";
    await invoice.save();
    return { status: "failed", error: invoice.emailError };
  }
};

const createInvoiceFromSnapshot = async ({
  source,
  customer,
  currency = "INR",
  items = [],
  subtotal = 0,
  discountAmount = 0,
  deliveryFee = 0,
  total = 0,
  deliveredAt = new Date(),
}) => {
  await connectMongo();

  const existingInvoice = await Invoice.findOne({
    "source.type": source.type,
    "source.id": source.id,
    "source.deliveryKey": source.deliveryKey,
  });

  if (existingInvoice) {
    return { invoice: existingInvoice, created: false };
  }

  const [settings, skuDocs] = await Promise.all([
    getInvoiceSettings(),
    Sku.find({}),
  ]);
  const skuMap = new Map(
    skuDocs.map((sku) => [
      String(sku.sku || "").trim().toUpperCase(),
      {
        hsnCode: String(sku.hsnCode || "").trim(),
        gstRate: Number(sku.gstRate || 0),
      },
    ])
  );
  const seller = {
    legalName: settings.sellerLegalName || INVOICE_SELLER_NAME,
    address: settings.sellerAddress || "",
    addressLine2: settings.sellerAddressLine2 || "",
    placeId: settings.sellerPlaceId || "",
    state: settings.sellerState || "",
    stateCode: settings.sellerStateCode || "",
    gstin: settings.sellerGstin || "",
  };
  const normalizedCustomer = {
    name: customer.name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    address: customer.address || "",
    state: customer.state || inferIndianStateFromAddress(customer.address).state || "",
    stateCode:
      normalizeStateCode(customer.stateCode) ||
      inferIndianStateFromAddress(customer.address).stateCode ||
      "",
  };
  const gstTreatment = getGstTreatment({
    sellerGstin: seller.gstin,
    sellerStateCode: seller.stateCode,
    customerStateCode: normalizedCustomer.stateCode,
  });
  const invoiceItems = normalizeItems({ items, skuMap, gstTreatment });
  const deliveryTax = {
    hsnSac: settings.deliveryHsnSac || "",
    gstRate: Number(settings.deliveryGstRate || 0),
    ...calculateTaxAmounts({
      taxableAmount: deliveryFee,
      gstRate: settings.deliveryGstRate,
      gstTreatment,
    }),
  };
  const itemTaxTotals = invoiceItems.reduce(
    (totals, item) => ({
      taxableAmount: roundMoney(totals.taxableAmount + Number(item.taxableAmount || 0)),
      cgstAmount: roundMoney(totals.cgstAmount + Number(item.cgstAmount || 0)),
      sgstAmount: roundMoney(totals.sgstAmount + Number(item.sgstAmount || 0)),
      igstAmount: roundMoney(totals.igstAmount + Number(item.igstAmount || 0)),
    }),
    { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 }
  );
  const taxSummary = {
    taxableAmount: roundMoney(itemTaxTotals.taxableAmount + Number(deliveryTax.taxableAmount || 0)),
    cgstAmount: roundMoney(itemTaxTotals.cgstAmount + Number(deliveryTax.cgstAmount || 0)),
    sgstAmount: roundMoney(itemTaxTotals.sgstAmount + Number(deliveryTax.sgstAmount || 0)),
    igstAmount: roundMoney(itemTaxTotals.igstAmount + Number(deliveryTax.igstAmount || 0)),
    totalTaxAmount: 0,
    placeOfSupply:
      normalizedCustomer.state ||
      (normalizedCustomer.stateCode ? `State code ${normalizedCustomer.stateCode}` : ""),
    placeOfSupplyStateCode: normalizedCustomer.stateCode,
    gstTreatment,
  };
  taxSummary.totalTaxAmount = roundMoney(
    taxSummary.cgstAmount + taxSummary.sgstAmount + taxSummary.igstAmount
  );
  const invoiceDate = new Date();
  const normalizedTotal = Number(total || 0);
  const invoice = await Invoice.create({
    invoiceNumber: await getNextInvoiceNumber(invoiceDate),
    sellerName: seller.legalName,
    seller,
    invoiceLabel: settings.invoiceLabel || "Invoice",
    snapshotVersion: 2,
    source,
    customer: normalizedCustomer,
    currency,
    items: invoiceItems,
    subtotal: Number(subtotal || 0),
    discountAmount: Number(discountAmount || 0),
    deliveryFee: Number(deliveryFee || 0),
    deliveryTax,
    taxSummary,
    total: normalizedTotal,
    grandTotal: roundMoney(normalizedTotal + taxSummary.totalTaxAmount),
    deliveredAt,
    invoiceDate,
    computerGeneratedText: settings.computerGeneratedText,
    emailStatus: "pending",
  });

  return { invoice, created: true };
};

export const createAndSendPreorderInvoice = async ({ preorder }) => {
  const deliveredAt = preorder.deliveredAt || new Date();
  const { invoice, created } = await createInvoiceFromSnapshot({
    source: {
      type: "preorder",
      id: String(preorder.id || preorder._id),
      label: preorder.preorderWindowLabel || "Preorder",
      deliveryKey: "final",
    },
    customer: {
      name: preorder.customerName || "",
      email: preorder.email || "",
      phone: preorder.phone || "",
      address:
        preorder.fulfillmentMethod === "pickup"
          ? preorder.pickupAddressSnapshot || preorder.pickupDoorNumber || ""
          : preorder.normalizedDeliveryAddress || preorder.address || "",
    },
    currency: preorder.currency || preorder.payment?.currency || "INR",
    items: preorder.items || [],
    subtotal: preorder.subtotal,
    discountAmount: preorder.discount?.discountAmount || 0,
    deliveryFee: preorder.deliveryFee,
    total: preorder.total || preorder.payment?.amount || preorder.subtotal,
    deliveredAt,
  });
  const emailDelivery = created ? await sendInvoiceEmail({ invoice }) : { status: "already_created" };

  return { invoice, created, emailDelivery };
};

export const createAndSendOrderPlanInvoice = async ({ orderPlan, deliveryDate = "" }) => {
  const deliveredAt = orderPlan.deliveredAt || new Date();
  const recurringDeliveryKey = toDateKey(deliveryDate || orderPlan.nextDeliveryDate || deliveredAt);
  const { invoice, created } = await createInvoiceFromSnapshot({
    source: {
      type: "order_plan",
      id: String(orderPlan.id || orderPlan._id),
      label: orderPlan.mode === "recurring" ? "Recurring order" : "One-time order",
      deliveryKey: orderPlan.mode === "recurring" ? recurringDeliveryKey : "final",
    },
    customer: {
      name: orderPlan.name || "",
      email: orderPlan.email || "",
      phone: orderPlan.phone || "",
      address: orderPlan.normalizedDeliveryAddress || orderPlan.address || "",
    },
    currency: orderPlan.currency || orderPlan.payment?.currency || "INR",
    items: orderPlan.items || [],
    subtotal: orderPlan.subtotal,
    deliveryFee: orderPlan.deliveryFee,
    total: orderPlan.total || orderPlan.payment?.amount || orderPlan.subtotal,
    deliveredAt,
  });
  const emailDelivery = created ? await sendInvoiceEmail({ invoice }) : { status: "already_created" };

  return { invoice, created, emailDelivery };
};

export const createAndSendSubscriptionInvoice = async ({
  subscription,
  deliveryDate,
  deliveredAt = new Date(),
}) => {
  const deliveryKey = toDateKey(deliveryDate || deliveredAt);
  const { invoice, created } = await createInvoiceFromSnapshot({
    source: {
      type: "subscription",
      id: String(subscription.id || subscription._id),
      label: "Subscription",
      deliveryKey,
    },
    customer: {
      name: subscription.name || "",
      email: subscription.email || "",
      phone: subscription.phone || "",
      address: subscription.normalizedDeliveryAddress || subscription.address || "",
    },
    currency: subscription.currency || subscription.billing?.currency || "INR",
    items: subscription.items || [],
    subtotal: subscription.subtotal,
    deliveryFee: subscription.deliveryFee,
    total: subscription.total || subscription.billing?.amount || subscription.subtotal,
    deliveredAt,
  });
  const emailDelivery = created ? await sendInvoiceEmail({ invoice }) : { status: "already_created" };

  return { invoice, created, emailDelivery };
};

export const createAndSendRouteDeliveryInvoice = async ({
  sourceType,
  sourceId,
  deliveryDate,
  deliveredAt = new Date(),
}) => {
  await connectMongo();

  if (sourceType === "subscription") {
    const subscription = await Subscription.findById(sourceId);

    if (!subscription) {
      throw new Error("Subscription not found.");
    }

    return createAndSendSubscriptionInvoice({ subscription, deliveryDate, deliveredAt });
  }

  if (sourceType === "order_plan") {
    const orderPlan = await OrderPlan.findById(sourceId);

    if (!orderPlan) {
      throw new Error("Order not found.");
    }

    orderPlan.deliveredAt = deliveredAt;
    return createAndSendOrderPlanInvoice({ orderPlan, deliveryDate });
  }

  throw new Error("Unsupported delivery source.");
};
