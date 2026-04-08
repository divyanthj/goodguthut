import { buildDeliveryRoutePlan } from "@/libs/delivery-route";
import connectMongo from "@/libs/mongoose";
import { formatPickupAddress, getActiveWindowFilter } from "@/libs/preorder-windows";
import { getSubscriptionSettings } from "@/libs/subscription-settings";
import PreorderWindow from "@/models/PreorderWindow";
import Subscription from "@/models/Subscription";

const CONFIRMED_BILLING_STATUSES = new Set(["authenticated", "active", "pending", "completed"]);
const EXCLUDED_SUBSCRIPTION_STATUSES = new Set(["cancelled", "paused"]);

const buildEmptyRouteSnapshot = ({
  deliveryDate = "",
  pickupAddress = "",
  payoutPerKm = 0,
  error = "",
  status = "idle",
} = {}) => ({
  deliveryDate,
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

const getSubscriptionRoutePickupAddress = async () => {
  const activeWindow = await PreorderWindow.findOne(getActiveWindowFilter()).sort({
    opensAt: -1,
    updatedAt: -1,
    createdAt: -1,
  });
  const fallbackWindow = activeWindow
    ? null
    : await PreorderWindow.findOne({
        pickupAddress: { $ne: "" },
        "deliveryBands.0": { $exists: true },
      }).sort({
        status: 1,
        updatedAt: -1,
        createdAt: -1,
      });
  const deliveryWindow = activeWindow || fallbackWindow;

  if (!deliveryWindow) {
    return {
      pickupAddress: "",
      payoutPerKm: 0,
    };
  }

  return {
    pickupAddress: formatPickupAddress({
      pickupDoorNumber: deliveryWindow.pickupDoorNumber,
      pickupAddress: deliveryWindow.pickupAddress,
    }),
    payoutPerKm: Number(deliveryWindow.driverPayoutPerKm || 0),
  };
};

const isRouteEligibleSubscription = (subscription) => {
  if (!subscription?.nextDeliveryDate) {
    return false;
  }

  if (EXCLUDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return false;
  }

  if (!(subscription.normalizedDeliveryAddress || subscription.address)) {
    return false;
  }

  return (
    subscription.status === "active" ||
    CONFIRMED_BILLING_STATUSES.has(subscription.billing?.status || "")
  );
};

const sortSnapshotsByDate = (snapshots = []) =>
  [...snapshots].sort((left, right) =>
    String(left.deliveryDate || "").localeCompare(String(right.deliveryDate || ""))
  );

export const recalculateSubscriptionRouteSnapshots = async () => {
  await connectMongo();

  const [settings, subscriptions, routeSettings] = await Promise.all([
    getSubscriptionSettings(),
    Subscription.find({}).sort({ nextDeliveryDate: 1, createdAt: 1 }),
    getSubscriptionRoutePickupAddress(),
  ]);
  const pickupAddress = routeSettings.pickupAddress || "";
  const payoutPerKm = Number(routeSettings.payoutPerKm || 0);
  const eligibleSubscriptions = subscriptions.filter(isRouteEligibleSubscription);

  if (eligibleSubscriptions.length === 0) {
    settings.deliveryRouteSnapshots = [];
    await settings.save();
    return settings.deliveryRouteSnapshots;
  }

  const groupedByDate = eligibleSubscriptions.reduce((groups, subscription) => {
    const deliveryDate = String(subscription.nextDeliveryDate || "").trim();

    if (!deliveryDate) {
      return groups;
    }

    const currentGroup = groups.get(deliveryDate) || [];
    currentGroup.push(subscription);
    groups.set(deliveryDate, currentGroup);
    return groups;
  }, new Map());

  const snapshots = [];

  for (const [deliveryDate, groupedSubscriptions] of groupedByDate.entries()) {
    if (!pickupAddress) {
      snapshots.push(
        buildEmptyRouteSnapshot({
          deliveryDate,
          pickupAddress,
          payoutPerKm,
          status: "error",
          error: "Add a verified pickup address before route planning can run.",
        })
      );
      continue;
    }

    try {
      const routePlan = await buildDeliveryRoutePlan({
        pickupAddress,
        preorders: groupedSubscriptions.map((subscription) => ({
          id: subscription.id,
          fulfillmentMethod: "delivery",
          customerName: subscription.name,
          phone: subscription.phone,
          email: subscription.email || "",
          address: subscription.address,
          normalizedDeliveryAddress:
            subscription.normalizedDeliveryAddress || subscription.address,
          totalQuantity: Number(subscription.totalQuantity || 0),
          total: Number(subscription.total || subscription.subtotal || 0),
          status: subscription.status,
          items: (subscription.items || []).map((item) => ({
            sku: item.sku,
            productName: item.productName,
            quantity: Number(item.quantity || 0),
          })),
        })),
        driverPayoutPerKm: payoutPerKm,
      });

      snapshots.push({
        deliveryDate,
        status: "ready",
        generatedAt: new Date(),
        originAddress: routePlan.originAddress,
        totalStops: routePlan.totalStops,
        totalDistanceKm: routePlan.totalDistanceKm,
        driverPayout: routePlan.driverPayout,
        payoutPerKm: routePlan.payoutPerKm,
        error: "",
        stops: routePlan.stops.map((stop) => {
          const subscription = groupedSubscriptions.find(
            (entry) => String(entry.id) === String(stop.preorderId)
          );

          return {
            stopNumber: stop.stopNumber,
            subscriptionId: stop.preorderId,
            customerName: stop.customerName,
            phone: stop.phone,
            email: stop.email,
            address: stop.address,
            totalQuantity: stop.totalQuantity,
            total: stop.total,
            cadence: subscription?.cadence || "",
            status: subscription?.status || stop.status || "",
            billingStatus: subscription?.billing?.status || "",
            nextDeliveryDate: subscription?.nextDeliveryDate || deliveryDate,
            legDistanceKm: stop.legDistanceKm,
            cumulativeDistanceKm: stop.cumulativeDistanceKm,
            mapsUrl: stop.mapsUrl,
            items: stop.items,
          };
        }),
      });
    } catch (error) {
      snapshots.push(
        buildEmptyRouteSnapshot({
          deliveryDate,
          pickupAddress,
          payoutPerKm,
          status: "error",
          error: error.message || "Could not calculate subscription delivery route.",
        })
      );
    }
  }

  settings.deliveryRouteSnapshots = sortSnapshotsByDate(snapshots);
  await settings.save();

  return settings.deliveryRouteSnapshots;
};
