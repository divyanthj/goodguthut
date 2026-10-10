export const SUBSCRIPTION_PROCESSING_FEE = 50;
export const PREPAID_SUBSCRIPTION_WEEKS = [1, 2, 4];

const money = (value) => Number(Number(value).toFixed(2));

export const getKanjiSubscriptionBoxes = (catalog = []) => {
  const variants = catalog.filter((item) => item.status === "active" && item.category === "kanji");
  const boxes = variants.map((item) => ({
    id: item.sku,
    name: item.name,
    items: [{ ...item, quantity: 6 }],
  }));
  // Two of every active variant must still make exactly six bottles.
  if (variants.length === 3) {
    boxes.unshift({ id: "mixed", name: "Mixed kanji box", items: variants.map((item) => ({ ...item, quantity: 2 })) });
  }
  return boxes;
};

export const assertSubscriptionBox = (items = [], catalog = [], durationWeeks = 0) => {
  const variants = new Set(catalog.filter((item) => item.status === "active" && item.category === "kanji").map((item) => item.sku));
  const skus = new Set(items.map((item) => item.sku));
  if (!items.length || skus.size !== items.length || items.some((item) => !variants.has(item.sku) || !Number.isInteger(item.quantity) || item.quantity <= 0) || items.reduce((sum, item) => sum + item.quantity, 0) !== 6) {
    throw new Error("Subscriptions require exactly six bottles of active kanji variants per week.");
  }
  if (Number(durationWeeks) !== 1 && !getKanjiSubscriptionBoxes(catalog).some((box) => box.items.length === items.length && box.items.every((expected) => items.some((item) => item.sku === expected.sku && item.quantity === expected.quantity)))) {
    throw new Error("Subscriptions require a mixed box or six bottles of a single variant.");
  }
};

export const calculatePrepaidSubscriptionPrice = ({ weeklySubtotal = 0, durationWeeks = 0, code = "" } = {}) => {
  const weeks = Number(durationWeeks);
  if (!PREPAID_SUBSCRIPTION_WEEKS.includes(weeks)) throw new Error("Select Trial, 2 weeks, or 4 weeks.");
  if (!Number.isFinite(Number(weeklySubtotal)) || Number(weeklySubtotal) < 0) throw new Error("Invalid subscription bottle price.");
  const normalizedCode = String(code).trim().toUpperCase().replace(/\s+/g, "");
  if (normalizedCode && normalizedCode !== "TRAYA") throw new Error("Only TRAYA is available for subscriptions.");
  if (normalizedCode && weeks === 1) throw new Error("TRAYA is available only for 2-week and 4-week subscriptions.");
  const subtotal = money(Number(weeklySubtotal) * weeks);
  const amount = normalizedCode ? (weeks === 2 ? 5 : 10) : 0;
  const discountAmount = money(subtotal * amount / 100);
  const subtotalAfterDiscount = money(subtotal - discountAmount);
  return {
    subtotal,
    discount: { code: normalizedCode, amount, discountAmount, subtotalAfterDiscount },
    processingFee: SUBSCRIPTION_PROCESSING_FEE,
    deliveryFee: 0,
    total: money(subtotalAfterDiscount + SUBSCRIPTION_PROCESSING_FEE),
  };
};

export const isPrepaidSubscription = (order = {}) => order.mode === "recurring" && order.paymentType === "one_time";

export const getSubscriptionEndDate = ({ startDate = "", durationWeeks = 0 } = {}) => {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (!PREPAID_SUBSCRIPTION_WEEKS.includes(Number(durationWeeks)) || Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(durationWeeks) * 7 - 1);
  return date.toISOString().slice(0, 10);
};

export const getSubscriptionDeliveryPricing = (order, deliveryDate) => {
  const weeks = Number(order.durationWeeks);
  const first = order.firstDeliveryDate || order.startDate;
  const cycle = (new Date(`${deliveryDate}T00:00:00Z`) - new Date(`${first}T00:00:00Z`)) / (7 * 86400000);
  if (!PREPAID_SUBSCRIPTION_WEEKS.includes(weeks) || cycle < 0 || cycle >= weeks || !Number.isInteger(cycle)) throw new Error("Invalid subscription delivery date.");
  const subtotal = money((order.items || []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0));
  const fullDiscount = Number(order.discount?.discountAmount || 0);
  const regularDiscount = money(fullDiscount / weeks);
  const discountAmount = cycle === weeks - 1 ? money(fullDiscount - regularDiscount * (weeks - 1)) : regularDiscount;
  const processingFee = cycle === 0 ? Number(order.processingFee || 0) : 0;
  return { subtotal, discountAmount, processingFee, total: money(subtotal - discountAmount + processingFee) };
};
