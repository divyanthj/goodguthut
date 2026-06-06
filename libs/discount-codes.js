import DiscountCode from "@/models/DiscountCode";

export const DISCOUNT_CAMPAIGN_TYPES = [
  {
    value: "general",
    label: "General",
    description: "A normal discount code for broad use.",
  },
  {
    value: "weekly_offer",
    label: "Weekly Offer",
    description: "A short-running weekly offer, even if the discount is small.",
  },
  {
    value: "birthday",
    label: "Birthday",
    description: "A birthday code to use once birthday collection exists.",
  },
  {
    value: "winback",
    label: "Win-back",
    description: "A nudge for customers who have not ordered in a while.",
  },
];

const CAMPAIGN_TYPE_VALUES = new Set(DISCOUNT_CAMPAIGN_TYPES.map((item) => item.value));

export const normalizeDiscountCode = (value = "") =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

export const normalizeDiscountCampaignType = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  return CAMPAIGN_TYPE_VALUES.has(normalized) ? normalized : "general";
};

const normalizeDateValue = (value = "") => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const normalizeDiscountCodePayload = (body = {}) => {
  const isPerpetual = body.isPerpetual === true;
  const startsAt = normalizeDateValue(body.startsAt);
  const expiresAtValue = normalizeDateValue(body.expiresAt);
  const expiresAt =
    !isPerpetual && expiresAtValue && !Number.isNaN(expiresAtValue.getTime())
      ? expiresAtValue
      : null;
  const maxRedemptions = Math.max(0, Math.round(Number(body.maxRedemptions || 0)));
  const redemptionCount = Math.max(0, Math.round(Number(body.redemptionCount || 0)));

  return {
    code: normalizeDiscountCode(body.code || ""),
    amount: Math.max(0, Math.min(100, Number(body.amount || 0))),
    campaignType: normalizeDiscountCampaignType(body.campaignType),
    campaignName: String(body.campaignName || "").trim().slice(0, 120),
    startsAt,
    isPerpetual,
    expiresAt,
    maxRedemptions,
    redemptionCount,
    adminNotes: String(body.adminNotes || "").trim().slice(0, 500),
    status: body.status === "archived" ? "archived" : "active",
  };
};

export const isDiscountCodeActive = (discountCode, now = new Date()) => {
  if (!discountCode || discountCode.status !== "active") {
    return false;
  }

  const isRedemptionCapOpen =
    !discountCode.maxRedemptions ||
    Number(discountCode.redemptionCount || 0) < Number(discountCode.maxRedemptions || 0);

  if (!isRedemptionCapOpen) {
    return false;
  }

  if (discountCode.startsAt && new Date(discountCode.startsAt).getTime() > now.getTime()) {
    return false;
  }

  if (discountCode.isPerpetual) {
    return true;
  }

  if (!discountCode.expiresAt) {
    return true;
  }

  return new Date(discountCode.expiresAt).getTime() >= now.getTime();
};

export const getDiscountCodeStatusLabel = (discountCode, now = new Date()) => {
  if (!discountCode) {
    return "missing";
  }

  if (discountCode.status !== "active") {
    return "archived";
  }

  if (discountCode.startsAt && new Date(discountCode.startsAt).getTime() > now.getTime()) {
    return "scheduled";
  }

  if (
    discountCode.maxRedemptions &&
    Number(discountCode.redemptionCount || 0) >= Number(discountCode.maxRedemptions || 0)
  ) {
    return "redeemed";
  }

  return isDiscountCodeActive(discountCode, now) ? "active" : "expired";
};

export const calculateDiscountAmount = ({ subtotal = 0, amount = 0 }) => {
  const normalizedSubtotal = Math.max(0, Number(subtotal || 0));
  const normalizedPercent = Math.max(0, Math.min(100, Number(amount || 0)));
  return Number(((normalizedSubtotal * normalizedPercent) / 100).toFixed(2));
};

export const resolveDiscountCode = async ({ code = "", subtotal = 0, now = new Date() }) => {
  const normalizedCode = normalizeDiscountCode(code);

  if (!normalizedCode) {
    return {
      discountCode: null,
      discount: {
        code: "",
        amount: 0,
        discountAmount: 0,
        subtotalAfterDiscount: Math.max(0, Number(subtotal || 0)),
      },
    };
  }

  const discountCode = await DiscountCode.findOne({ code: normalizedCode });

  if (!discountCode) {
    throw new Error("Discount code not found.");
  }

  if (!isDiscountCodeActive(discountCode, now)) {
    throw new Error("This discount code is no longer active.");
  }

  const discountAmount = calculateDiscountAmount({
    subtotal,
    amount: discountCode.amount,
  });
  const subtotalAfterDiscount = Math.max(0, Number(subtotal || 0) - discountAmount);

  return {
    discountCode,
    discount: {
      code: discountCode.code,
      amount: Number(discountCode.amount || 0),
      discountAmount,
      subtotalAfterDiscount,
      isPerpetual: discountCode.isPerpetual === true,
      expiresAt: discountCode.expiresAt || null,
      campaignType: discountCode.campaignType || "general",
      campaignName: discountCode.campaignName || "",
    },
  };
};
