export const preorderCatalog = [
  {
    sku: "GGH-KCK-250",
    name: "Kokum Carrot Kanji",
    note: "Tangy kokum + earthy carrot fermentation with a bold, savory finish.",
    defaultUnitPrice: 0,
  },
  {
    sku: "GGH-CUK-250",
    name: "Cucumber Kanji",
    note: "Light, crisp and cooling with a naturally probiotic kick.",
    defaultUnitPrice: 0,
  },
  {
    sku: "GGH-PSP-300",
    name: "Pineapple Sparkle",
    note: "Tepache-inspired tropical fizz with gentle fermentation funk.",
    defaultUnitPrice: 0,
  },
  {
    sku: "GGH-MSP-300",
    name: "Melon Sparkle",
    note: "Juicy melon brightness, softly sparkling and ultra-refreshing.",
    defaultUnitPrice: 0,
  },
  {
    sku: "GGH-BUG-330",
    name: "Bug Sodas",
    note: "Experimental small-batch fermented sodas for curious palates.",
    defaultUnitPrice: 0,
  },
];

export const createDefaultAllowedItems = () =>
  preorderCatalog.map((item) => ({
    sku: item.sku,
    productName: item.name,
    unitPrice: item.defaultUnitPrice,
    isActive: true,
    maxPerOrder: 10,
    notes: item.note,
  }));

export const createDefaultDeliveryBands = () => [
  {
    minDistanceKm: 0,
    maxDistanceKm: 7,
    fee: 0,
  },
  {
    minDistanceKm: 7,
    maxDistanceKm: 15,
    fee: 0,
  },
];

export const createDefaultPreorderWindow = () => {
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 7);

  return {
    title: "Current preorder window",
    status: "draft",
    deliveryDate: deliveryDate.toISOString(),
    currency: "INR",
    minimumOrderQuantity: 4,
    pickupAddress: "",
    deliveryBands: createDefaultDeliveryBands(),
    allowedItems: createDefaultAllowedItems(),
    allowCustomerNotes: true,
  };
};
