export const preorderCatalog = [
  {
    sku: "GGH-KCK-250",
    name: "Kokum Carrot Kanji",
    notes: "Tangy kokum + earthy carrot fermentation with a bold, savory finish.",
    unitPrice: 0,
    status: "active",
  },
  {
    sku: "GGH-CUK-250",
    name: "Cucumber Kanji",
    notes: "Light, crisp and cooling with a naturally probiotic kick.",
    unitPrice: 0,
    status: "active",
  },
  {
    sku: "GGH-PSP-300",
    name: "Pineapple Sparkle",
    notes: "Tepache-inspired tropical fizz with gentle fermentation funk.",
    unitPrice: 0,
    status: "active",
  },
  {
    sku: "GGH-MSP-300",
    name: "Melon Sparkle",
    notes: "Juicy melon brightness, softly sparkling and ultra-refreshing.",
    unitPrice: 0,
    status: "active",
  },
  {
    sku: "GGH-BUG-330",
    name: "Bug Sodas",
    notes: "Experimental small-batch fermented sodas for curious palates.",
    unitPrice: 0,
    status: "active",
  },
];

export const createDefaultSkuCatalog = () =>
  preorderCatalog.map((item) => ({
    sku: item.sku,
    name: item.name,
    notes: item.notes,
    unitPrice: item.unitPrice,
    status: item.status,
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
    title: "New preorder batch",
    status: "draft",
    opensAt: null,
    closesAt: null,
    deliveryDate: deliveryDate.toISOString(),
    currency: "INR",
    minimumOrderQuantity: 4,
    pickupAddress: "",
    deliveryBands: createDefaultDeliveryBands(),
    allowedItems: [],
    allowCustomerNotes: true,
  };
};
