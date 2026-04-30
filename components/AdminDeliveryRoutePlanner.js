"use client";

import { useMemo, useState } from "react";

const formatCurrency = (currency, amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDateOnly = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
  });
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

const formatWhatsAppRouteMessage = (batch, routePlan) => {
  const routeMapLink = buildGoogleMapsRouteLink(routePlan.originAddress, routePlan.stops);
  const lines = [
    `*Delivery Route: ${batch.title || "Batch"}*`,
    `*Date:* ${formatDateOnly(batch.deliveryDate)}`,
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

export default function AdminDeliveryRoutePlanner({
  initialWindows = [],
  initialPreorders = [],
}) {
  const [copiedBatchKey, setCopiedBatchKey] = useState("");

  const activeDeliveryBatches = useMemo(() => {
    const orderCounts = new Map();

    initialPreorders.forEach((preorder) => {
      const windowId = preorder.preorderWindow || "";

      if (
        windowId &&
        preorder.fulfillmentMethod === "delivery" &&
        ["confirmed", "shipped"].includes(preorder.status)
      ) {
        orderCounts.set(windowId, Number(orderCounts.get(windowId) || 0) + 1);
      }
    });

    return initialWindows.filter((windowData) => Number(orderCounts.get(windowData.id) || 0) > 0);
  }, [initialPreorders, initialWindows]);

  const handleCopyWhatsAppText = async (batch, routePlan) => {
    const batchKey = `${batch.id}`;
    const copied = await copyToClipboard(formatWhatsAppRouteMessage(batch, routePlan));

    if (copied) {
      setCopiedBatchKey(batchKey);
      window.setTimeout(() => {
        setCopiedBatchKey((current) => (current === batchKey ? "" : current));
      }, 1800);
    }
  };

  return (
    <section className="rounded-2xl bg-base-100 p-5 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Delivery route planner</h2>
          <p className="text-sm opacity-70">
            Ordered stop lists are updated automatically as delivery orders come in or their status changes.
          </p>
        </div>
        <div className="badge badge-outline">{activeDeliveryBatches.length} batch{activeDeliveryBatches.length === 1 ? "" : "es"}</div>
      </div>

      <div className="mt-4 space-y-4">
        {activeDeliveryBatches.length === 0 && (
          <div className="rounded-xl bg-base-200 p-4 text-sm opacity-70">
            No active delivery batches have confirmed delivery orders yet.
          </div>
        )}

        {activeDeliveryBatches.map((batch) => {
          const routePlan = batch.deliveryRouteSnapshot || null;

          return (
            <article key={batch.id} className="rounded-xl bg-base-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{batch.title}</div>
                  <div className="mt-1 text-sm opacity-70">
                    Delivery date: {formatDateOnly(batch.deliveryDate)}
                  </div>
                  <div className="mt-1 text-sm opacity-70">
                    Driver payout: {formatCurrency(batch.currency || "INR", batch.driverPayoutPerKm || 0)} / km
                  </div>
                  <div className="mt-1 text-xs opacity-60">
                    Last updated: {routePlan?.generatedAt ? formatDateOnly(routePlan.generatedAt) : "-"}
                  </div>
                </div>
                {routePlan && routePlan.status === "ready" && routePlan.stops.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => handleCopyWhatsAppText(batch, routePlan)}
                  >
                    {copiedBatchKey === `${batch.id}` ? "Copied" : "Copy whole route text"}
                  </button>
                )}
              </div>

              {routePlan && routePlan.status === "ready" && (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl bg-base-100 p-4 text-sm">
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Pickup</div>
                      <div className="mt-2">{routePlan.originAddress}</div>
                    </div>
                    <div className="rounded-xl bg-base-100 p-4 text-sm">
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Stops</div>
                      <div className="mt-2 text-2xl font-semibold">{routePlan.totalStops}</div>
                    </div>
                    <div className="rounded-xl bg-base-100 p-4 text-sm">
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Route distance</div>
                      <div className="mt-2 text-2xl font-semibold">{Number(routePlan.totalDistanceKm || 0).toFixed(1)} km</div>
                    </div>
                    <div className="rounded-xl bg-base-100 p-4 text-sm">
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Driver payout</div>
                      <div className="mt-2 text-2xl font-semibold">
                        {formatCurrency(batch.currency || "INR", routePlan.driverPayout || 0)}
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
                            <th className="text-right">Leg km</th>
                            <th className="text-right">Cumulative km</th>
                            <th className="text-right">Bottles</th>
                            <th>Map</th>
                          </tr>
                        </thead>
                        <tbody>
                          {routePlan.stops.map((stop) => (
                            <tr key={`${batch.id}-${stop.preorderId}`}>
                              <td className="font-medium">{stop.stopNumber}</td>
                              <td>
                                <div className="font-medium">{stop.customerName}</div>
                                <div className="text-xs opacity-60">{formatCurrency(batch.currency || "INR", stop.total || 0)}</div>
                              </td>
                              <td>{stop.phone}</td>
                              <td className="min-w-[260px]">{stop.address}</td>
                              <td className="text-right">{Number(stop.legDistanceKm || 0).toFixed(1)}</td>
                              <td className="text-right">{Number(stop.cumulativeDistanceKm || 0).toFixed(1)}</td>
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
                      No delivery stops are pending for this batch.
                    </div>
                  )}
                </div>
              )}

              {routePlan?.status === "error" && (
                <div className="alert alert-error mt-4">
                  <span>{routePlan.error || "Could not calculate delivery route."}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
