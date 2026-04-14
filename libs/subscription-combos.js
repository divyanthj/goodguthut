import SubscriptionCombo from "@/models/SubscriptionCombo";

export const sanitizeSubscriptionComboItems = (items = []) => {
  const seenSkus = new Set();

  return items
    .map((item) => ({
      sku: (item?.sku || "").trim().toUpperCase(),
      quantity: Math.max(0, Number(item?.quantity || 0)),
    }))
    .filter((item) => item.sku && item.quantity > 0)
    .filter((item) => {
      if (seenSkus.has(item.sku)) {
        return false;
      }

      seenSkus.add(item.sku);
      return true;
    });
};

export const getSubscriptionComboTotalQuantity = (items = []) =>
  sanitizeSubscriptionComboItems(items).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

export const validateSubscriptionComboItems = (items = [], skuMap = new Map()) => {
  const normalizedItems = sanitizeSubscriptionComboItems(items);

  if (normalizedItems.length === 0) {
    throw new Error("Add at least one SKU to the combo.");
  }

  normalizedItems.forEach((item) => {
    const sku = skuMap.get(item.sku);

    if (!sku || sku.status !== "active") {
      throw new Error(`SKU ${item.sku} is not currently available`);
    }
  });

  const totalQuantity = getSubscriptionComboTotalQuantity(normalizedItems);

  if (totalQuantity < 4) {
    throw new Error("Subscription combos must contain at least 4 bottles.");
  }

  if (totalQuantity > 10) {
    throw new Error("Subscription combos cannot contain more than 10 bottles.");
  }

  return normalizedItems;
};

export const hydrateSubscriptionCombo = (combo, skuMap = new Map()) => {
  if (!combo) {
    return null;
  }

  const serialized = JSON.parse(JSON.stringify(combo));
  const items = sanitizeSubscriptionComboItems(serialized.items || []).map((item) => {
    const sku = skuMap.get(item.sku);
    const unitPrice = Math.max(0, Number(sku?.unitPrice || 0));

    return {
      sku: item.sku,
      quantity: Number(item.quantity || 0),
      productName: sku?.name || item.sku,
      note: sku?.notes || "",
      unitPrice,
      lineTotal: Number(item.quantity || 0) * unitPrice,
      status: sku?.status || "archived",
      skuType: sku?.skuType || "perennial",
    };
  });

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const isRecurringEligible =
    items.length > 0 &&
    items.every(
      (item) => item.status === "active" && (item.skuType || "perennial") === "perennial"
    );

  return {
    ...serialized,
    items,
    totalQuantity,
    subtotal,
    isRecurringEligible,
  };
};

export const listSubscriptionCombos = async ({
  includeArchived = true,
} = {}) => {
  const filter = includeArchived ? {} : { status: { $ne: "archived" } };
  return SubscriptionCombo.find(filter).sort({
    sortOrder: 1,
    isFeatured: -1,
    status: 1,
    name: 1,
    createdAt: -1,
  });
};
