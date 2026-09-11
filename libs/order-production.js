const normalizeSku = (value = "") => String(value || "").trim().toUpperCase();

export const getInventoryFulfilledSkuSet = (order = {}) =>
  new Set(
    (Array.isArray(order.inventory?.items) ? order.inventory.items : [])
      .map((item) => normalizeSku(item?.sku))
      .filter(Boolean)
  );

export const getMadeToOrderItems = (order = {}) => {
  const inventorySkus = getInventoryFulfilledSkuSet(order);

  return (Array.isArray(order.items) ? order.items : []).filter(
    (item) => !inventorySkus.has(normalizeSku(item?.sku))
  );
};

export const getMadeToOrderQuantity = (order = {}) =>
  getMadeToOrderItems(order).reduce(
    (total, item) => total + Math.max(0, Number(item?.quantity || 0)),
    0
  );

export const hasMadeToOrderDemand = (order = {}) => getMadeToOrderQuantity(order) > 0;
