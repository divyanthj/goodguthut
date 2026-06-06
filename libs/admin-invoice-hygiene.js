const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (value) => {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const daysAgo = (value, now) => {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
};

const getInvoiceSourceKey = ({ type = "", id = "", deliveryKey = "" } = {}) =>
  [type, id, deliveryKey].map((part) => String(part || "").trim()).join(":");

const getInvoiceStatus = (invoice = {}) => {
  const status = String(invoice.emailStatus || "").trim();

  if (["pending", "sent", "skipped", "failed"].includes(status)) {
    return status;
  }

  return invoice.emailSentAt ? "sent" : "pending";
};

const getCustomerName = (record = {}) =>
  record.customerName || record.name || record.customer?.name || "Customer";

const getOrderNumber = (record = {}) =>
  record.orderNumber || record.invoiceNumber || record.id || record._id || "";

const getRecordId = (record = {}) => String(record.id || record._id || "");

const buildInvoiceAttentionItems = (invoices = []) =>
  invoices
    .map((invoice) => ({
      id: getRecordId(invoice),
      invoiceNumber: invoice.invoiceNumber || "",
      customerName: getCustomerName(invoice),
      customerEmail: invoice.customer?.email || "",
      status: getInvoiceStatus(invoice),
      error: invoice.emailError || "",
      lastAttemptAt: invoice.emailLastAttemptAt || invoice.emailSentAt || invoice.updatedAt || null,
    }))
    .filter((invoice) => ["pending", "skipped", "failed"].includes(invoice.status))
    .sort((left, right) => {
      if (left.status === "failed" && right.status !== "failed") {
        return -1;
      }

      if (left.status !== "failed" && right.status === "failed") {
        return 1;
      }

      return new Date(right.lastAttemptAt || 0).getTime() - new Date(left.lastAttemptAt || 0).getTime();
    })
    .slice(0, 6);

const buildDeliveredOrderGaps = ({ preorders = [], orderPlans = [], invoiceSourceKeys = new Set() }) => {
  const preorderGaps = preorders
    .filter((preorder) => preorder.status === "fulfilled" && preorder.deliveredAt)
    .filter((preorder) => {
      const key = getInvoiceSourceKey({
        type: "preorder",
        id: getRecordId(preorder),
        deliveryKey: "final",
      });
      return !invoiceSourceKeys.has(key);
    })
    .map((preorder) => ({
      id: getRecordId(preorder),
      type: "Preorder",
      orderNumber: getOrderNumber(preorder),
      customerName: getCustomerName(preorder),
      deliveredAt: preorder.deliveredAt,
    }));

  const oneTimePlanGaps = orderPlans
    .filter((plan) => plan.mode === "one_time" && plan.status === "fulfilled" && plan.deliveredAt)
    .filter((plan) => {
      const key = getInvoiceSourceKey({
        type: "order_plan",
        id: getRecordId(plan),
        deliveryKey: "final",
      });
      return !invoiceSourceKeys.has(key);
    })
    .map((plan) => ({
      id: getRecordId(plan),
      type: "One-time order",
      orderNumber: getOrderNumber(plan),
      customerName: getCustomerName(plan),
      deliveredAt: plan.deliveredAt,
    }));

  return [...preorderGaps, ...oneTimePlanGaps]
    .sort((left, right) => new Date(right.deliveredAt || 0).getTime() - new Date(left.deliveredAt || 0).getTime())
    .slice(0, 6);
};

const buildOperationalFollowUps = ({ preorders = [], orderPlans = [], now }) => {
  const preorderFollowUps = preorders
    .map((preorder) => {
      const ageDays = daysAgo(preorder.updatedAt || preorder.createdAt, now);
      const status = String(preorder.status || "").trim();

      if (["pending", "payment_pending"].includes(status) && Number(ageDays) >= 2) {
        return {
          id: getRecordId(preorder),
          type: "Preorder",
          orderNumber: getOrderNumber(preorder),
          customerName: getCustomerName(preorder),
          status,
          ageDays,
          reason: "Awaiting confirmation or payment follow-up",
        };
      }

      if (["confirmed", "shipped"].includes(status) && Number(ageDays) >= 2) {
        return {
          id: getRecordId(preorder),
          type: "Preorder",
          orderNumber: getOrderNumber(preorder),
          customerName: getCustomerName(preorder),
          status,
          ageDays,
          reason: status === "shipped" ? "Check delivery closure" : "Check production or dispatch",
        };
      }

      return null;
    })
    .filter(Boolean);

  const planFollowUps = orderPlans
    .map((plan) => {
      const ageDays = daysAgo(plan.lastContactedAt || plan.updatedAt || plan.createdAt, now);
      const status = String(plan.status || "").trim();
      const paymentStatus = String(plan.payment?.status || "").trim();

      if (["new", "payment_pending", "failed"].includes(status) && Number(ageDays) >= 2) {
        return {
          id: getRecordId(plan),
          type: plan.mode === "recurring" ? "Recurring order" : "One-time order",
          orderNumber: getOrderNumber(plan),
          customerName: getCustomerName(plan),
          status,
          ageDays,
          reason: paymentStatus === "created" ? "Mandate setup needs a nudge" : "Customer follow-up pending",
        };
      }

      if (["confirmed", "shipped", "active"].includes(status) && Number(ageDays) >= 2) {
        return {
          id: getRecordId(plan),
          type: plan.mode === "recurring" ? "Recurring order" : "One-time order",
          orderNumber: getOrderNumber(plan),
          customerName: getCustomerName(plan),
          status,
          ageDays,
          reason: status === "shipped" ? "Check delivery closure" : "Check production or next delivery",
        };
      }

      return null;
    })
    .filter(Boolean);

  return [...preorderFollowUps, ...planFollowUps]
    .sort((left, right) => Number(right.ageDays || 0) - Number(left.ageDays || 0))
    .slice(0, 8);
};

export const buildAdminInvoiceHygieneSummary = ({
  invoices = [],
  sourceInvoices = [],
  incompleteSkuCount = 0,
  preorders = [],
  orderPlans = [],
  now = new Date(),
} = {}) => {
  const invoiceSourceKeys = new Set(
    sourceInvoices
      .map((invoice) => getInvoiceSourceKey(invoice.source || {}))
      .filter((key) => key.replace(/:/g, ""))
  );
  const recentSince = new Date(now.getTime() - 7 * DAY_MS);
  const statusCounts = invoices.reduce(
    (counts, invoice) => {
      const status = getInvoiceStatus(invoice);
      return {
        ...counts,
        [status]: Number(counts[status] || 0) + 1,
      };
    },
    { pending: 0, sent: 0, skipped: 0, failed: 0 }
  );
  const invoiceAttentionItems = buildInvoiceAttentionItems(invoices);
  const deliveredOrderGaps = buildDeliveredOrderGaps({
    preorders,
    orderPlans,
    invoiceSourceKeys,
  });
  const operationalFollowUps = buildOperationalFollowUps({ preorders, orderPlans, now });
  const recentInvoiceCount = invoices.filter((invoice) => {
    const invoiceDate = toDate(invoice.invoiceDate || invoice.createdAt);
    return invoiceDate && invoiceDate >= recentSince;
  }).length;
  const attentionCount =
    Number(statusCounts.pending || 0) +
    Number(statusCounts.skipped || 0) +
    Number(statusCounts.failed || 0) +
    deliveredOrderGaps.length +
    operationalFollowUps.length +
    Number(incompleteSkuCount || 0);

  return {
    attentionCount,
    statusCounts,
    recentInvoiceCount,
    incompleteSkuCount: Number(incompleteSkuCount || 0),
    deliveredOrderGapCount: deliveredOrderGaps.length,
    operationalFollowUpCount: operationalFollowUps.length,
    invoiceAttentionItems,
    deliveredOrderGaps,
    operationalFollowUps,
    generatedAt: now.toISOString(),
  };
};

