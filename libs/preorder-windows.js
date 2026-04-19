export const MAX_PER_ORDER_LIMIT = 24;

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

export const sanitizeAllowedItems = (items = []) => {
  const seenSkus = new Set();

  return items
    .map((item) => {
      const sku = (typeof item === "string" ? item : item?.sku || "").trim().toUpperCase();
      return sku ? { sku } : null;
    })
    .filter(Boolean)
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

export const formatPickupAddress = ({
  pickupDoorNumber = "",
  pickupAddress = "",
} = {}) =>
  [pickupDoorNumber, pickupAddress]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeOptionalCurrencyAmount = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

export const normalizePreorderWindowPayload = ({
  body = {},
  fallbackTitle = "Preorder batch",
} = {}) => {
  const allowedItems = sanitizeAllowedItems(body.allowedItems);
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
      pickupDoorNumber: (body.pickupDoorNumber || "").trim(),
      allowFreePickup: body.allowFreePickup === true,
      deliveryBands,
      freeDeliveryThreshold: normalizeOptionalCurrencyAmount(body.freeDeliveryThreshold),
      driverPayoutPerKm: Math.max(0, Number(body.driverPayoutPerKm || 0)),
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

export const getLiveOpenWindowMessage = (preorderWindow) => {
  if (!preorderWindow) {
    return "";
  }

  if (preorderWindow.closesAt) {
    const closesAt = new Date(preorderWindow.closesAt).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return `The current preorder batch "${preorderWindow.title}" is open until ${closesAt}. Schedule the next batch after it closes.`;
  }

  return `The current preorder batch "${preorderWindow.title}" is already open. Close it or set its close time before scheduling the next batch.`;
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
