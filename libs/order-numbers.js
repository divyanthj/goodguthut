import connectMongo from "@/libs/mongoose";
import InvoiceCounter from "@/models/InvoiceCounter";

const ORDER_NUMBER_PAD_LENGTH = 6;
const LEGACY_ORDER_NUMBER_PREFIX = "GGH-ORD-";

const getYearMonthCode = (value = new Date()) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "0000";
  }

  return [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
  ].join("");
};

const getOrderTypeCode = ({ sourceType = "", mode = "" } = {}) => {
  if (String(sourceType || "").trim() === "legacy_preorder") {
    return "OT";
  }

  return String(mode || "").trim() === "recurring" ? "RC" : "OT";
};

const getOrderCounterKey = ({ typeCode = "OT", yearMonth = "0000" } = {}) =>
  `GGH-ORDER-${typeCode}-${yearMonth}`;

const getOrderNumberPrefix = ({ typeCode = "OT", yearMonth = "0000" } = {}) =>
  typeCode === "RC" ? `GGH_RC(${yearMonth})` : `GGH-OT(${yearMonth})`;

const formatOrderNumber = ({ typeCode = "OT", yearMonth = "0000", sequence = 0 } = {}) =>
  `${getOrderNumberPrefix({ typeCode, yearMonth })}-${String(Number(sequence || 0)).padStart(
    ORDER_NUMBER_PAD_LENGTH,
    "0"
  )}`;

const buildOrderNumberContext = ({ sourceType = "", mode = "", date = new Date() } = {}) => {
  const yearMonth = getYearMonthCode(date);
  const typeCode = getOrderTypeCode({ sourceType, mode });

  return {
    yearMonth,
    typeCode,
    counterKey: getOrderCounterKey({ typeCode, yearMonth }),
  };
};

const isExpectedOrderNumberFormat = (orderNumber = "", context = {}) => {
  const value = String(orderNumber || "").trim();

  if (!value) {
    return false;
  }

  if (value.startsWith(LEGACY_ORDER_NUMBER_PREFIX)) {
    return false;
  }

  const prefix = `${getOrderNumberPrefix(context)}-`;

  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+$`).test(value);
};

export const reserveNextOrderNumber = async ({ sourceType = "", mode = "", date = new Date() } = {}) => {
  await connectMongo();
  const context = buildOrderNumberContext({ sourceType, mode, date });

  const counter = await InvoiceCounter.findOneAndUpdate(
    { key: context.counterKey },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return formatOrderNumber({
    typeCode: context.typeCode,
    yearMonth: context.yearMonth,
    sequence: counter.sequence,
  });
};

export const ensureOrderNumberForDocument = async (doc) => {
  if (!doc) {
    return doc;
  }

  const sourceType = doc.customerName ? "legacy_preorder" : "order_plan";
  const context = buildOrderNumberContext({
    sourceType,
    mode: doc.mode || "one_time",
    date: doc.createdAt || new Date(),
  });

  if (isExpectedOrderNumberFormat(doc.orderNumber, context)) {
    return doc;
  }

  const orderNumber = await reserveNextOrderNumber({
    sourceType,
    mode: doc.mode || "one_time",
    date: doc.createdAt || new Date(),
  });
  const updatedDoc = await doc.constructor.findOneAndUpdate(
    {
      _id: doc._id,
      $or: [
        { orderNumber: { $exists: false } },
        { orderNumber: "" },
        { orderNumber: String(doc.orderNumber || "").trim() },
      ],
    },
    { $set: { orderNumber } },
    { new: true }
  );

  if (updatedDoc) {
    return updatedDoc;
  }

  return doc.constructor.findById(doc._id);
};

export const ensureOrderNumbersForDocuments = async (docs = []) =>
  Promise.all((Array.isArray(docs) ? docs : []).map((doc) => ensureOrderNumberForDocument(doc)));
