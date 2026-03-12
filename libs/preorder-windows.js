export const MAX_PER_ORDER_LIMIT = 10;

const ACTIVE_STATUS = "open";
const VALID_STATUSES = new Set(["draft", "open", "closed", "archived"]);

export const sortPreorderWindows = (windows = []) => {
  const statusRank = {
    open: 0,
    draft: 1,
    closed: 2,
    archived: 3,
  };

  return [...windows].sort((left, right) => {
    const leftRank = statusRank[left.status] ?? 9;
    const rightRank = statusRank[right.status] ?? 9;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftDelivery = left.deliveryDate ? new Date(left.deliveryDate).getTime() : 0;
    const rightDelivery = right.deliveryDate ? new Date(right.deliveryDate).getTime() : 0;

    if (leftDelivery !== rightDelivery) {
      return rightDelivery - leftDelivery;
    }

    const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;

    return rightUpdated - leftUpdated;
  });
};

export const sanitizeAllowedItems = (items = [], fallbackItems = []) => {
  const fallbackMap = new Map(fallbackItems.map((item) => [item.sku, item]));
  const seenSkus = new Set();

  return items
    .map((item) => {
      const sku = (item.sku || "").trim().toUpperCase();
      const fallback = fallbackMap.get(sku);
      const parsedMaxPerOrder = Number(item.maxPerOrder);

      return {
        sku,
        productName: (item.productName || fallback?.productName || "").trim(),
        unitPrice: Math.max(0, Number(item.unitPrice || 0)),
        isActive: item.isActive !== false,
        maxPerOrder: Number.isFinite(parsedMaxPerOrder)
          ? Math.min(MAX_PER_ORDER_LIMIT, Math.max(1, parsedMaxPerOrder))
          : MAX_PER_ORDER_LIMIT,
        notes: (item.notes || fallback?.notes || "").trim(),
      };
    })
    .filter((item) => item.sku && item.productName)
    .filter((item) => {
      if (seenSkus.has(item.sku)) {
        return false;
      }

      seenSkus.add(item.sku);
      return true;
    });
};

export const sanitizeDeliveryBands = (bands = []) =>
  bands
    .map((band) => {
      const minDistanceKm = Math.max(0, Number(band.minDistanceKm ?? 0));
      const maxDistanceKm = Math.max(minDistanceKm, Number(band.maxDistanceKm ?? minDistanceKm));
      const fee = Math.max(0, Number(band.fee ?? 0));

      return {
        minDistanceKm,
        maxDistanceKm,
        fee,
      };
    })
    .filter((band) => band.maxDistanceKm > band.minDistanceKm)
    .sort((a, b) => a.minDistanceKm - b.minDistanceKm);

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizePreorderWindowPayload = ({
  body = {},
  fallbackTitle = "Preorder batch",
  fallbackItems = [],
} = {}) => {
  const allowedItems = sanitizeAllowedItems(body.allowedItems, fallbackItems);
  const deliveryBands = sanitizeDeliveryBands(body.deliveryBands);
  const normalizedStatus = VALID_STATUSES.has(body.status)
    ? body.status
    : body.isOpen
      ? ACTIVE_STATUS
      : "draft";

  return {
    payload: {
      title: (body.title || fallbackTitle).trim(),
      status: normalizedStatus,
      opensAt: normalizeDate(body.opensAt),
      closesAt: normalizeDate(body.closesAt),
      deliveryDate: normalizeDate(body.deliveryDate) || new Date(),
      currency: (body.currency || "INR").trim().toUpperCase() || "INR",
      minimumOrderQuantity: Math.max(1, Number(body.minimumOrderQuantity || 1)),
      pickupAddress: (body.pickupAddress || "").trim(),
      deliveryBands,
      allowCustomerNotes: body.allowCustomerNotes !== false,
      allowedItems,
    },
    allowedItems,
  };
};

export const isWindowAcceptingOrders = (preorderWindow, now = new Date()) => {
  if (!preorderWindow || preorderWindow.status !== ACTIVE_STATUS) {
    return false;
  }

  if (preorderWindow.opensAt && new Date(preorderWindow.opensAt) > now) {
    return false;
  }

  if (preorderWindow.closesAt && new Date(preorderWindow.closesAt) <= now) {
    return false;
  }

  return true;
};

export const getActiveWindowFilter = (now = new Date()) => ({
  status: ACTIVE_STATUS,
  $or: [{ opensAt: null }, { opensAt: { $lte: now } }],
  $and: [
    {
      $or: [{ closesAt: null }, { closesAt: { $gt: now } }],
    },
  ],
});
