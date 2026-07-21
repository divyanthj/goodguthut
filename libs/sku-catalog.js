import Sku from "@/models/Sku";

const LEGACY_SEEDED_SKU_CODES = new Set([
  "GGH-BUG-330",
  "GGH-CUK-250",
  "GGH-KCK-250",
  "GGH-MSP-300",
  "GGH-PSP-300",
]);

export const SKU_CATEGORY_OPTIONS = [
  {
    value: "kanji",
    label: "Kanji",
    description: "Traditional fermented kanji and bold daily drinks.",
    defaultLeadTimeDays: 3,
  },
  {
    value: "sparkle",
    label: "Sparkle",
    description: "Light fermented fizz and easy sipping bottles.",
    defaultLeadTimeDays: 2,
  },
  {
    value: "pickles",
    label: "Pickles",
    description: "Slow, spiced vegetable ferments and pickle jars.",
    defaultLeadTimeDays: 7,
  },
  {
    value: "gift_packs",
    label: "Gift Packs",
    description: "Curated packs for gifting, birthdays, and thank-yous.",
    defaultLeadTimeDays: 3,
  },
  {
    value: "subscriptions",
    label: "Subscriptions",
    description: "Products or packs best suited to recurring plans.",
    defaultLeadTimeDays: 3,
  },
  {
    value: "custom_orders",
    label: "Custom Orders",
    description: "Bulk, event, custom pack, and made-to-brief products.",
    defaultLeadTimeDays: 5,
  },
  {
    value: "other",
    label: "Other",
    description: "Products waiting to be categorized.",
    defaultLeadTimeDays: 3,
  },
];

const SKU_CATEGORY_VALUES = new Set(SKU_CATEGORY_OPTIONS.map((item) => item.value));
const CATEGORY_SORT_RANK = new Map(
  SKU_CATEGORY_OPTIONS.map((item, index) => [item.value, index])
);

export const normalizeSkuCategory = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  return SKU_CATEGORY_VALUES.has(normalized) ? normalized : "other";
};

export const getSkuCategoryLabel = (value = "") =>
  SKU_CATEGORY_OPTIONS.find((item) => item.value === normalizeSkuCategory(value))?.label ||
  "Other";

export const DEFAULT_CATEGORY_LEAD_TIMES = Object.fromEntries(
  SKU_CATEGORY_OPTIONS.map((category) => [
    category.value,
    category.defaultLeadTimeDays,
  ])
);

export const sanitizeCategoryLeadTimes = (value = {}) => {
  const source = value && typeof value === "object" ? value : {};

  return Object.fromEntries(
    SKU_CATEGORY_OPTIONS.map((category) => {
      const rawValue = source[category.value];
      const fallback = category.defaultLeadTimeDays;
      const normalized = Number(rawValue);

      return [
        category.value,
        Number.isFinite(normalized)
          ? Math.max(0, Math.min(60, Math.round(normalized)))
          : fallback,
      ];
    })
  );
};

export const getEffectiveSkuLeadTimeDays = (
  item = {},
  categoryLeadTimes = DEFAULT_CATEGORY_LEAD_TIMES
) => {
  const productLeadTime = Number(item.leadTimeDays || 0);

  if (Number.isFinite(productLeadTime) && productLeadTime > 0) {
    return Math.round(productLeadTime);
  }

  const normalizedCategory = normalizeSkuCategory(item.category);
  const sanitizedLeadTimes = sanitizeCategoryLeadTimes(categoryLeadTimes);
  return sanitizedLeadTimes[normalizedCategory] ?? DEFAULT_CATEGORY_LEAD_TIMES.other;
};

const normalizePublicText = (value = "", maxLength = 500) =>
  String(value || "").trim().slice(0, maxLength);

export const normalizeSkuPublicMetadata = (body = {}) => ({
  category: normalizeSkuCategory(body.category),
  imageUrl: normalizePublicText(body.imageUrl, 1000),
  shortDescription: normalizePublicText(body.shortDescription, 240),
  benefits: normalizePublicText(body.benefits, 500),
  leadTimeDays: Math.max(0, Math.round(Number(body.leadTimeDays || 0))),
  displayOrder: Number.isFinite(Number(body.displayOrder))
    ? Math.round(Number(body.displayOrder))
    : 0,
  packLabel: normalizePublicText(body.packLabel, 120),
});

const normalizeLegacyAllowedItem = (item) => {
  if (!item) {
    return null;
  }

  if (typeof item === "string") {
    const sku = item.trim().toUpperCase();
    return sku ? { sku } : null;
  }

  const sku = (item.sku || "").trim().toUpperCase();

  if (!sku) {
    return null;
  }

  return {
    sku,
    name: (item.productName || item.name || "").trim(),
    notes: (item.notes || "").trim(),
    unitPrice: Math.max(0, Number(item.unitPrice || 0)),
    status: item.isActive === false ? "archived" : "active",
  };
};

export const normalizeAllowedItemRefs = (allowedItems = []) => {
  const seenSkus = new Set();

  return allowedItems
    .map((item) => normalizeLegacyAllowedItem(item))
    .filter((item) => item?.sku)
    .filter((item) => {
      if (seenSkus.has(item.sku)) {
        return false;
      }

      seenSkus.add(item.sku);
      return true;
    })
    .map((item) => ({ sku: item.sku }));
};

export const isLegacySeededSkuCode = (sku = "") => LEGACY_SEEDED_SKU_CODES.has((sku || "").trim().toUpperCase());

export const filterSkuCatalog = (skuCatalog = []) =>
  skuCatalog
    .filter((item) => !isLegacySeededSkuCode(item?.sku))
    .map((item) => {
      const serialized = item?.toJSON ? item.toJSON() : item;
      const isSeasonal =
        serialized?.isSeasonal === true || serialized?.skuType === "seasonal";

      return {
        ...serialized,
        category: normalizeSkuCategory(serialized?.category),
        categoryLabel: getSkuCategoryLabel(serialized?.category),
        imageUrl: String(serialized?.imageUrl || "").trim(),
        shortDescription: String(serialized?.shortDescription || "").trim(),
        benefits: String(serialized?.benefits || "").trim(),
        leadTimeDays: Math.max(0, Number(serialized?.leadTimeDays || 0)),
        effectiveLeadTimeDays: Number(serialized?.effectiveLeadTimeDays || 0) > 0
          ? Number(serialized.effectiveLeadTimeDays)
          : getEffectiveSkuLeadTimeDays(serialized),
        displayOrder: Number(serialized?.displayOrder || 0),
        packLabel: String(serialized?.packLabel || "").trim(),
        skuType: isSeasonal ? "seasonal" : "perennial",
        isSeasonal,
        recurringCutoffDate: String(serialized?.recurringCutoffDate || "").trim(),
      };
    });

export const listSkuCatalog = async () => {
  await Sku.updateMany(
    { skuType: { $exists: false } },
    { $set: { skuType: "perennial" } }
  );
  await Sku.updateMany(
    { category: { $exists: false } },
    { $set: { category: "other" } }
  );
  const skuCatalog = await Sku.find({}).sort({
    status: 1,
    category: 1,
    displayOrder: 1,
    name: 1,
    sku: 1,
  });
  return filterSkuCatalog(skuCatalog);
};

export const getSkuMap = (skuCatalog = []) =>
  new Map(
    skuCatalog.map((item) => [
      item.sku,
      {
        sku: item.sku,
        name: item.name,
        notes: item.notes || "",
        category: normalizeSkuCategory(item.category),
        categoryLabel: getSkuCategoryLabel(item.category),
        imageUrl: String(item.imageUrl || "").trim(),
        shortDescription: String(item.shortDescription || "").trim(),
        benefits: String(item.benefits || "").trim(),
        leadTimeDays: Math.max(0, Number(item.leadTimeDays || 0)),
        effectiveLeadTimeDays: Number(item.effectiveLeadTimeDays || 0) > 0
          ? Number(item.effectiveLeadTimeDays)
          : getEffectiveSkuLeadTimeDays(item),
        displayOrder: Number(item.displayOrder || 0),
        packLabel: String(item.packLabel || "").trim(),
        unitPrice: Number(item.unitPrice || 0),
        hsnCode: String(item.hsnCode || "").trim(),
        gstRate: Number(item.gstRate || 0),
        status: item.status || "active",
        skuType:
          item.isSeasonal === true || item.skuType === "seasonal"
            ? "seasonal"
            : "perennial",
        isSeasonal: item.isSeasonal === true || item.skuType === "seasonal",
        recurringCutoffDate: String(item.recurringCutoffDate || "").trim(),
      },
    ])
  );

export const hydrateAllowedItems = (allowedItems = [], skuMap) =>
  normalizeAllowedItemRefs(allowedItems)
    .map((item) => {
      const catalogItem = skuMap.get(item.sku);

      if (catalogItem) {
        return catalogItem;
      }

      return {
        sku: item.sku,
        name: item.sku,
        notes: "",
        category: "other",
        categoryLabel: "Other",
        imageUrl: "",
        shortDescription: "",
        benefits: "",
        leadTimeDays: 0,
        effectiveLeadTimeDays: DEFAULT_CATEGORY_LEAD_TIMES.other,
        displayOrder: 0,
        packLabel: "",
        unitPrice: 0,
        hsnCode: "",
        gstRate: 0,
        status: "active",
        skuType: "perennial",
        isSeasonal: false,
        recurringCutoffDate: "",
      };
    });

export const hydrateWindowWithCatalog = (preorderWindow, skuMap) => {
  if (!preorderWindow) {
    return null;
  }

  const serialized = preorderWindow.toJSON ? preorderWindow.toJSON() : preorderWindow;

  return {
    ...serialized,
    pickupAddressDisplay:
      [serialized.pickupDoorNumber, serialized.pickupAddress]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(", "),
    allowedItems: hydrateAllowedItems(serialized.allowedItems || [], skuMap),
  };
};
