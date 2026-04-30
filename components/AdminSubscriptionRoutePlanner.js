"use client";

import { useState } from "react";
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

const toDateKey = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const todayDateKey = () => toDateKey(new Date());

const formatRouteRunTitle = (deliveryDate) => {
  const dateKey = toDateKey(deliveryDate);

  if (dateKey && dateKey === todayDateKey()) {
    return "Deliveries for today";
  }

  return `Deliveries for ${formatSubscriptionDate(deliveryDate) || deliveryDate}`;
};

const buildGoogleMapsRouteLink = (originAddress, stops = []) => {
  const cleanedOrigin = String(originAddress || "").trim();
  const stopAddresses = (Array.isArray(stops) ? stops : [])
    .map((stop) => String(stop?.address || "").trim())
    .filter(Boolean);

  if (!cleanedOrigin || stopAddresses.length === 0) {
    return "";
  }

  const destination = stopAddresses[stopAddresses.length - 1];
  const waypoints = stopAddresses.slice(0, -1);
  const query = new URLSearchParams({
    api: "1",
    origin: cleanedOrigin,
    destination,
    travelmode: "driving",
  });

  if (waypoints.length > 0) {
    query.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${query.toString()}`;
};

const formatPhoneForMessage = (value) => {
  const rawPhone = String(value || "").trim();

  if (!rawPhone) {
    return "-";
  }

  const withoutLeadingZeroes = rawPhone.replace(/^0+/, "");
  return withoutLeadingZeroes || rawPhone;
};

const formatWhatsAppRouteMessage = (routePlan) => {
  const routeMapLink = buildGoogleMapsRouteLink(routePlan.originAddress, routePlan.stops);
  const lines = [
    `*Delivery Route: ${formatSubscriptionDate(routePlan.deliveryDate) || routePlan.deliveryDate}*`,
    `*Total Stops:* ${routePlan.totalStops || routePlan.stops.length || 0}`,
    `*Route Map:* ${routeMapLink || "-"}`,
    "",
  ];

  routePlan.stops.forEach((stop, index) => {
    lines.push(`${index + 1}. *Name:* ${stop.customerName || "-"}`);
    lines.push(`   *Phone:* ${formatPhoneForMessage(stop.phone)}`);
    lines.push(`   *Address:* ${stop.address || "-"}`);
    lines.push(`   *Location:* ${stop.mapsUrl || "-"}`);
    lines.push("");
  });

  return lines.join("\n").trim();
};

const getRouteStopTypeLabel = (stop = {}) => {
  if (stop.routeSource === "order_plan") {
    return stop.mode === "recurring" ? "Recurring order" : "One-time order";
  }

  return "Subscription";
};

const copyToClipboard = async (value) => {
  if (!value) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
};

export default function AdminSubscriptionRoutePlanner({
  initialRouteSnapshots = [],
  currency = "INR",
}) {
  const [copiedRouteKey, setCopiedRouteKey] = useState("");

  const handleCopyWhatsAppText = async (routePlan) => {
    const routeKey = `${routePlan.deliveryDate}`;
    const copied = await copyToClipboard(formatWhatsAppRouteMessage(routePlan));

    if (copied) {
      setCopiedRouteKey(routeKey);
      window.setTimeout(() => {
        setCopiedRouteKey((current) => (current === routeKey ? "" : current));
      }, 1800);
    }
  };

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Next delivery run</h2>
          <p className="text-sm opacity-70">
            The nearest committed delivery run is recalculated automatically when deliveries change.
          </p>
        </div>
        <div className="badge badge-outline">
          {initialRouteSnapshots.length ? "1 run" : "0 runs"}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {initialRouteSnapshots.length === 0 && (
          <div className="rounded-xl bg-base-200 p-4 text-sm opacity-70">
            No upcoming route runs have been generated yet.
          </div>
        )}

        {initialRouteSnapshots.map((routePlan) => (
          <article
            key={`subscription-route-${routePlan.deliveryDate}`}
            className="rounded-xl bg-base-200 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">
                  {formatRouteRunTitle(routePlan.deliveryDate)}
                </div>
                <div className="mt-1 text-sm opacity-70">
                  Driver payout: {formatCurrency(currency, routePlan.payoutPerKm || 0)} / km
                </div>
                <div className="mt-1 text-xs opacity-60">
                  Last updated: {formatDateTime(routePlan.generatedAt)}
                </div>
              </div>
              {routePlan.status === "ready" && routePlan.stops.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => handleCopyWhatsAppText(routePlan)}
                >
                  {copiedRouteKey === `${routePlan.deliveryDate}` ? "Copied" : "Copy whole route text"}
                </button>
              )}
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
                          <th>Customer</th>
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
                          <tr key={`${routePlan.deliveryDate}-${stop.subscriptionId || stop.orderPlanId}`}>
                            <td className="font-medium">{stop.stopNumber}</td>
                            <td>
                              <div className="font-medium">{stop.customerName}</div>
                              <div className="text-xs opacity-60">
                                {getRouteStopTypeLabel(stop)}
                                {stop.billingStatus ? ` - payment ${stop.billingStatus}` : ""}
                              </div>
                              <div className="text-xs opacity-60">
                                {formatCurrency(currency, stop.total || 0)}
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
                    No customers are queued for this delivery run.
                  </div>
                )}
              </div>
            )}

            {routePlan.status === "error" && (
              <div className="alert alert-error mt-4">
                <span>{routePlan.error || "Could not calculate this delivery route."}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

