"use client";

import { formatSubscriptionCadence } from "@/libs/subscriptions";
import { formatSubscriptionDate } from "@/libs/subscription-schedule";

const formatCurrency = (currency, amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function AdminSubscriptionRoutePlanner({
  initialRouteSnapshots = [],
  currency = "INR",
}) {
  if (!initialRouteSnapshots.length) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Subscription delivery routes</h2>
          <p className="text-sm opacity-70">
            Upcoming subscription runs are recalculated automatically whenever a subscriber changes state, address, or next delivery date.
          </p>
        </div>
        <div className="badge badge-outline">
          {initialRouteSnapshots.length} upcoming run{initialRouteSnapshots.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {initialRouteSnapshots.map((routePlan) => (
          <article
            key={`subscription-route-${routePlan.deliveryDate}`}
            className="rounded-xl bg-base-200 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">
                  Delivery run for {formatSubscriptionDate(routePlan.deliveryDate) || routePlan.deliveryDate}
                </div>
                <div className="mt-1 text-sm opacity-70">
                  Driver payout: {formatCurrency(currency, routePlan.payoutPerKm || 0)} / km
                </div>
                <div className="mt-1 text-xs opacity-60">
                  Last updated: {formatDateTime(routePlan.generatedAt)}
                </div>
              </div>
            </div>

            {routePlan.status === "ready" && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl bg-base-100 p-4 text-sm">
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Pickup</div>
                    <div className="mt-2">{routePlan.originAddress || "-"}</div>
                  </div>
                  <div className="rounded-xl bg-base-100 p-4 text-sm">
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Stops</div>
                    <div className="mt-2 text-2xl font-semibold">{routePlan.totalStops}</div>
                  </div>
                  <div className="rounded-xl bg-base-100 p-4 text-sm">
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Route distance</div>
                    <div className="mt-2 text-2xl font-semibold">
                      {Number(routePlan.totalDistanceKm || 0).toFixed(1)} km
                    </div>
                  </div>
                  <div className="rounded-xl bg-base-100 p-4 text-sm">
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Driver payout</div>
                    <div className="mt-2 text-2xl font-semibold">
                      {formatCurrency(currency, routePlan.driverPayout || 0)}
                    </div>
                  </div>
                </div>

                {routePlan.stops.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Stop</th>
                          <th>Subscriber</th>
                          <th>Phone</th>
                          <th>Address</th>
                          <th>Cadence</th>
                          <th className="text-right">Leg km</th>
                          <th className="text-right">Cumulative km</th>
                          <th className="text-right">Bottles</th>
                          <th>Map</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routePlan.stops.map((stop) => (
                          <tr key={`${routePlan.deliveryDate}-${stop.subscriptionId}`}>
                            <td className="font-medium">{stop.stopNumber}</td>
                            <td>
                              <div className="font-medium">{stop.customerName}</div>
                              <div className="text-xs opacity-60">
                                {formatCurrency(currency, stop.total || 0)} • billing {stop.billingStatus || "-"}
                              </div>
                            </td>
                            <td>{stop.phone}</td>
                            <td className="min-w-[260px]">{stop.address}</td>
                            <td>{formatSubscriptionCadence(stop.cadence)}</td>
                            <td className="text-right">{Number(stop.legDistanceKm || 0).toFixed(1)}</td>
                            <td className="text-right">
                              {Number(stop.cumulativeDistanceKm || 0).toFixed(1)}
                            </td>
                            <td className="text-right">{stop.totalQuantity}</td>
                            <td>
                              <a
                                className="link link-primary"
                                href={stop.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open map
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl bg-base-100 p-4 text-sm opacity-70">
                    No subscribers are queued for this delivery run.
                  </div>
                )}
              </div>
            )}

            {routePlan.status === "error" && (
              <div className="alert alert-error mt-4">
                <span>{routePlan.error || "Could not calculate subscription delivery route."}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
