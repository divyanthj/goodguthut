import { buildDeliveryRoutePlan } from "@/libs/delivery-route";
import { formatPickupAddress } from "@/libs/preorder-windows";
import Preorder from "@/models/Preorder";
import PreorderWindow from "@/models/PreorderWindow";

const buildIdleSnapshot = ({
  pickupAddress = "",
  payoutPerKm = 0,
  error = "",
  status = "idle",
} = {}) => ({
  status,
  generatedAt: new Date(),
  originAddress: pickupAddress,
  totalStops: 0,
  totalDistanceKm: 0,
  driverPayout: 0,
  payoutPerKm: Number(payoutPerKm || 0),
  error,
  stops: [],
});

export const recalculatePreorderWindowRouteSnapshot = async ({
  preorderWindowId = "",
  preorderWindow = null,
} = {}) => {
  const windowDoc =
    preorderWindow || (preorderWindowId ? await PreorderWindow.findById(preorderWindowId) : null);

  if (!windowDoc) {
    return null;
  }

  const pickupAddress = formatPickupAddress({
    pickupDoorNumber: windowDoc.pickupDoorNumber,
    pickupAddress: windowDoc.pickupAddress,
  });
  const payoutPerKm = Number(windowDoc.driverPayoutPerKm || 0);

  const preorders = await Preorder.find({
    preorderWindow: windowDoc._id,
    fulfillmentMethod: "delivery",
    status: { $in: ["confirmed", "shipped"] },
  }).sort({ createdAt: 1 });

  if (preorders.length === 0) {
    windowDoc.deliveryRouteSnapshot = buildIdleSnapshot({
      pickupAddress,
      payoutPerKm,
      status: "ready",
    });
    await windowDoc.save();
    return windowDoc.deliveryRouteSnapshot;
  }

  if (!pickupAddress) {
    windowDoc.deliveryRouteSnapshot = buildIdleSnapshot({
      pickupAddress,
      payoutPerKm,
      status: "error",
      error: "Add a verified pickup address before route planning can run.",
    });
    await windowDoc.save();
    return windowDoc.deliveryRouteSnapshot;
  }

  try {
    const routePlan = await buildDeliveryRoutePlan({
      pickupAddress,
      preorders: JSON.parse(JSON.stringify(preorders)),
      driverPayoutPerKm: payoutPerKm,
    });

    windowDoc.deliveryRouteSnapshot = {
      status: "ready",
      generatedAt: new Date(),
      originAddress: routePlan.originAddress,
      totalStops: routePlan.totalStops,
      totalDistanceKm: routePlan.totalDistanceKm,
      driverPayout: routePlan.driverPayout,
      payoutPerKm: routePlan.payoutPerKm,
      error: "",
      stops: routePlan.stops,
    };
    await windowDoc.save();
    return windowDoc.deliveryRouteSnapshot;
  } catch (error) {
    windowDoc.deliveryRouteSnapshot = buildIdleSnapshot({
      pickupAddress,
      payoutPerKm,
      status: "error",
      error: error.message || "Could not calculate delivery route.",
    });
    await windowDoc.save();
    return windowDoc.deliveryRouteSnapshot;
  }
};
