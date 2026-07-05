import DiscountCode from "@/models/DiscountCode";
import DiscountCodeGrant from "@/models/DiscountCodeGrant";

export const normalizeDiscountCode = (value = "") =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

export const getPhoneMatchKey = (value = "") => {
  const digits = String(value || "").replace(/[^\d]/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }

  return digits;
};

export const normalizeDiscountCodePayload = (body = {}) => {
  const isPerpetual = body.isPerpetual === true;
  const expiresAtValue = body.expiresAt ? new Date(body.expiresAt) : null;
  const expiresAt =
    !isPerpetual && expiresAtValue && !Number.isNaN(expiresAtValue.getTime())
      ? expiresAtValue
      : null;

  return {
    code: normalizeDiscountCode(body.code || ""),
    amount: Math.max(0, Math.min(100, Number(body.amount || 0))),
    isPerpetual,
    isNumberRestricted: body.isNumberRestricted === true,
    expiresAt,
    status: body.status === "archived" ? "archived" : "active",
  };
};

export const isDiscountCodeActive = (discountCode, now = new Date()) => {
  if (!discountCode || discountCode.status !== "active") {
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

  return isDiscountCodeActive(discountCode, now) ? "active" : "expired";
};

export const calculateDiscountAmount = ({ subtotal = 0, amount = 0 }) => {
  const normalizedSubtotal = Math.max(0, Number(subtotal || 0));
  const normalizedPercent = Math.max(0, Math.min(100, Number(amount || 0)));
  return Number(((normalizedSubtotal * normalizedPercent) / 100).toFixed(2));
};

export const hasDiscountCodeGrant = async ({ discountCode, phone = "" }) => {
  if (!discountCode?.isNumberRestricted) {
    return true;
  }

  const phoneKey = getPhoneMatchKey(phone);

  if (!phoneKey) {
    return false;
  }

  const grant = await DiscountCodeGrant.findOne({
    discountCode: discountCode._id || discountCode.id,
    phoneKey,
  });

  return Boolean(grant);
};

export const grantDiscountCodeToPhone = async ({
  discountCode,
  phone = "",
  source = "retention_nudge",
  sourceType = "",
  sourceId = "",
}) => {
  const phoneKey = getPhoneMatchKey(phone);

  if (!discountCode || !phoneKey) {
    return null;
  }

  return DiscountCodeGrant.findOneAndUpdate(
    {
      discountCode: discountCode._id || discountCode.id,
      phoneKey,
      source,
    },
    {
      discountCode: discountCode._id || discountCode.id,
      code: discountCode.code,
      phone,
      phoneKey,
      source,
      sourceType,
      sourceId,
      lastGrantedAt: new Date(),
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
};

export const resolveDiscountCode = async ({
  code = "",
  subtotal = 0,
  phone = "",
  now = new Date(),
}) => {
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

  if (discountCode.isNumberRestricted && !(await hasDiscountCodeGrant({ discountCode, phone }))) {
    throw new Error("Discount code not found.");
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
      isNumberRestricted: discountCode.isNumberRestricted === true,
      expiresAt: discountCode.expiresAt || null,
    },
  };
};
