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
