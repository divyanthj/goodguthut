import Sku from "@/models/Sku";

const LEGACY_SEEDED_SKU_CODES = new Set([
  "GGH-BUG-330",
  "GGH-CUK-250",
  "GGH-KCK-250",
  "GGH-MSP-300",
  "GGH-PSP-300",
]);

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
  skuCatalog.filter((item) => !isLegacySeededSkuCode(item?.sku));

export const listSkuCatalog = async () => {
  const skuCatalog = await Sku.find({}).sort({ status: 1, name: 1, sku: 1 });
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
        unitPrice: Number(item.unitPrice || 0),
        status: item.status || "active",
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
        unitPrice: 0,
        status: "active",
      };
    });

export const hydrateWindowWithCatalog = (preorderWindow, skuMap) => {
  if (!preorderWindow) {
    return null;
  }

  const serialized = preorderWindow.toJSON ? preorderWindow.toJSON() : preorderWindow;

  return {
    ...serialized,
    allowedItems: hydrateAllowedItems(serialized.allowedItems || [], skuMap),
  };
};
