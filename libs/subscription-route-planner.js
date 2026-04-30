import { buildDeliveryRoutePlan } from "@/libs/delivery-route";
import connectMongo from "@/libs/mongoose";
import { normalizeOneTimeOrderPlanStatus } from "@/libs/order-plans";
import { formatPickupAddress, getActiveWindowFilter } from "@/libs/preorder-windows";
import { getSubscriptionSettings } from "@/libs/subscription-settings";
import OrderPlan from "@/models/OrderPlan";
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

const isRouteEligibleOrderPlan = (orderPlan) => {
  if (!orderPlan?.nextDeliveryDate && !orderPlan?.firstDeliveryDate && !orderPlan?.startDate) {
    return false;
  }

  if (!(orderPlan.normalizedDeliveryAddress || orderPlan.address)) {
    return false;
  }

  if (orderPlan.mode === "one_time") {
    return ["confirmed", "shipped"].includes(normalizeOneTimeOrderPlanStatus(orderPlan.status));
  }

  if (orderPlan.mode === "recurring") {
    return (
      orderPlan.status === "active" ||
      CONFIRMED_BILLING_STATUSES.has(orderPlan.payment?.status || "")
    );
  }

  return false;
};

const getOrderPlanDeliveryDate = (orderPlan) =>
  String(orderPlan?.nextDeliveryDate || orderPlan?.firstDeliveryDate || orderPlan?.startDate || "").trim();

const mapSubscriptionToRouteStopInput = (subscription) => ({
  id: subscription.id,
  routeSource: "subscription",
  fulfillmentMethod: "delivery",
  customerName: subscription.name,
  phone: subscription.phone,
  email: subscription.email || "",
  address: subscription.address,
  normalizedDeliveryAddress: subscription.normalizedDeliveryAddress || subscription.address,
  totalQuantity: Number(subscription.totalQuantity || 0),
  total: Number(subscription.total || subscription.subtotal || 0),
  status: subscription.status,
  items: (subscription.items || []).map((item) => ({
    sku: item.sku,
    productName: item.productName,
    quantity: Number(item.quantity || 0),
  })),
});

const mapOrderPlanToRouteStopInput = (orderPlan) => ({
  id: orderPlan.id,
  routeSource: "order_plan",
  mode: orderPlan.mode || "",
  fulfillmentMethod: "delivery",
  customerName: orderPlan.name,
  phone: orderPlan.phone,
  email: orderPlan.email || "",
  address: orderPlan.address,
  normalizedDeliveryAddress: orderPlan.normalizedDeliveryAddress || orderPlan.address,
  totalQuantity: Number(orderPlan.totalQuantity || 0),
  total: Number(orderPlan.total || orderPlan.subtotal || 0),
  status:
    orderPlan.mode === "one_time"
      ? normalizeOneTimeOrderPlanStatus(orderPlan.status)
      : orderPlan.status,
  deliveredAt: orderPlan.deliveredAt || null,
  items: (orderPlan.items || []).map((item) => ({
    sku: item.sku,
    productName: item.productName,
    quantity: Number(item.quantity || 0),
  })),
});

const sortSnapshotsByDate = (snapshots = []) =>
  [...snapshots].sort((left, right) =>
    String(left.deliveryDate || "").localeCompare(String(right.deliveryDate || ""))
  );

export const recalculateSubscriptionRouteSnapshots = async () => {
  await connectMongo();

  const [settings, subscriptions, orderPlans, routeSettings] = await Promise.all([
    getSubscriptionSettings(),
    Subscription.find({}).sort({ nextDeliveryDate: 1, createdAt: 1 }),
    OrderPlan.find({}).sort({ nextDeliveryDate: 1, createdAt: 1 }),
    getSubscriptionRoutePickupAddress(),
  ]);
  const pickupAddress = routeSettings.pickupAddress || "";
  const payoutPerKm = Number(routeSettings.payoutPerKm || 0);
  const eligibleSubscriptions = subscriptions.filter(isRouteEligibleSubscription);
  const eligibleOrderPlans = orderPlans.filter(isRouteEligibleOrderPlan);

  if (eligibleSubscriptions.length === 0 && eligibleOrderPlans.length === 0) {
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

  eligibleOrderPlans.forEach((orderPlan) => {
    const deliveryDate = getOrderPlanDeliveryDate(orderPlan);

    if (!deliveryDate) {
      return;
    }

    const currentGroup = groupedByDate.get(deliveryDate) || [];
    currentGroup.push(orderPlan);
    groupedByDate.set(deliveryDate, currentGroup);
  });

  const snapshots = [];

  for (const [deliveryDate, groupedEntries] of groupedByDate.entries()) {
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
      const routeInputs = groupedEntries.map((entry) =>
        entry.constructor?.modelName === "OrderPlan"
          ? mapOrderPlanToRouteStopInput(entry)
          : mapSubscriptionToRouteStopInput(entry)
      );
      const routePlan = await buildDeliveryRoutePlan({
        pickupAddress,
        preorders: routeInputs,
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
          const sourceInput = routeInputs.find(
            (entry) => String(entry.id) === String(stop.preorderId)
          );
          const sourceEntry = groupedEntries.find(
            (entry) => String(entry.id) === String(stop.preorderId)
          );
          const isOrderPlan = sourceInput?.routeSource === "order_plan";

          return {
            stopNumber: stop.stopNumber,
            subscriptionId: isOrderPlan ? "" : stop.preorderId,
            orderPlanId: isOrderPlan ? stop.preorderId : "",
            routeSource: sourceInput?.routeSource || "subscription",
            mode: sourceInput?.mode || "",
            customerName: stop.customerName,
            phone: stop.phone,
            email: stop.email,
            address: stop.address,
            totalQuantity: stop.totalQuantity,
            total: stop.total,
            cadence: sourceEntry?.cadence || "",
            status:
              isOrderPlan && sourceEntry?.mode === "one_time"
                ? normalizeOneTimeOrderPlanStatus(sourceEntry?.status)
                : sourceEntry?.status || stop.status || "",
            billingStatus:
              sourceEntry?.billing?.status || sourceEntry?.payment?.status || "",
            nextDeliveryDate:
              sourceEntry?.nextDeliveryDate ||
              sourceEntry?.firstDeliveryDate ||
              sourceEntry?.startDate ||
              deliveryDate,
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
