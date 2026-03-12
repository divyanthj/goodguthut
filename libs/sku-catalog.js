import Sku from "@/models/Sku";
import PreorderWindow from "@/models/PreorderWindow";
import { createDefaultSkuCatalog } from "@/libs/preorder-catalog";

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

const getSeedSkusFromWindows = async () => {
  const windows = await PreorderWindow.find({})
    .sort({ updatedAt: -1, createdAt: -1 })
    .select({ allowedItems: 1 });
  const seedMap = new Map();

  windows.forEach((windowDoc) => {
    (windowDoc.allowedItems || []).forEach((allowedItem) => {
      const normalized = normalizeLegacyAllowedItem(allowedItem);

      if (!normalized?.sku || seedMap.has(normalized.sku)) {
        return;
      }

      seedMap.set(normalized.sku, {
        sku: normalized.sku,
        name: normalized.name || normalized.sku,
        notes: normalized.notes || "",
        unitPrice: normalized.unitPrice || 0,
        status: normalized.status || "active",
      });
    });
  });

  return [...seedMap.values()];
};

export const ensureSkuCatalogSeeded = async () => {
  const existingSkus = await Sku.find({}).select({ sku: 1 }).lean();
  const existingSkuCodes = new Set(existingSkus.map((item) => item.sku));
  const defaultSkus = createDefaultSkuCatalog();
  const legacySkus = await getSeedSkusFromWindows();
  const seedCandidates = [...legacySkus, ...defaultSkus];
  const seenCandidates = new Set();
  const docsToInsert = seedCandidates.filter((item) => {
    if (existingSkuCodes.has(item.sku) || seenCandidates.has(item.sku)) {
      return false;
    }

    seenCandidates.add(item.sku);
    return true;
  });

  if (docsToInsert.length > 0) {
    await Sku.insertMany(docsToInsert, { ordered: false });
  }

  return Sku.find({}).sort({ status: 1, name: 1, sku: 1 });
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
