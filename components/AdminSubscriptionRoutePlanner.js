"use client";

import { useEffect, useState } from "react";
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

  const query = new URLSearchParams({
    api: "1",
    origin: cleanedOrigin,
    destination: cleanedOrigin,
    travelmode: "driving",
  });

  query.set("waypoints", stopAddresses.join("|"));

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
  if (stop.routeSource === "additional") {
    return "Additional stop";
  }

  if (stop.routeSource === "order_plan") {
    return stop.mode === "recurring" ? "Recurring order" : "One-time order";
  }

  return "Subscription";
};

const emptyAdditionalStopForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

const createSessionToken = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const [routeSnapshots, setRouteSnapshots] = useState(initialRouteSnapshots);
  const [additionalStops, setAdditionalStops] = useState([]);
  const [additionalStopForm, setAdditionalStopForm] = useState(emptyAdditionalStopForm);
  const [selectedAdditionalPlace, setSelectedAdditionalPlace] = useState(null);
  const [addressSessionToken, setAddressSessionToken] = useState(() => createSessionToken());
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isLoadingAddressSuggestions, setIsLoadingAddressSuggestions] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState("");
  const [copiedRouteKey, setCopiedRouteKey] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [invoicingStopKey, setInvoicingStopKey] = useState("");
  const [invoiceMessages, setInvoiceMessages] = useState({});
  const currentRoute = routeSnapshots[0] || null;

  useEffect(() => {
    const input = additionalStopForm.address.trim();

    if (input.length < 3) {
      setAddressSuggestions([]);
      setIsLoadingAddressSuggestions(false);
      setAddressLookupError("");
      return undefined;
    }

    if (selectedAdditionalPlace && selectedAdditionalPlace.formattedAddress === additionalStopForm.address) {
      setAddressSuggestions([]);
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoadingAddressSuggestions(true);
      setAddressLookupError("");

      try {
        const response = await fetch("/api/preorder/address-autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            sessionToken: addressSessionToken,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Could not load address suggestions.");
        }

        setAddressSuggestions(data.suggestions || []);
      } catch (error) {
        setAddressSuggestions([]);
        setAddressLookupError(error.message || "Could not load address suggestions.");
      } finally {
        setIsLoadingAddressSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [additionalStopForm.address, addressSessionToken, selectedAdditionalPlace]);

  const previewRoute = async (nextAdditionalStops) => {
    if (!currentRoute?.deliveryDate) {
      setPreviewError("No delivery run is available yet.");
      return false;
    }

    setIsPreviewing(true);
    setPreviewError("");

    try {
      const response = await fetch("/api/admin/route-planner/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryDate: toDateKey(currentRoute.deliveryDate),
          additionalStops: nextAdditionalStops,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not preview this route.");
      }

      if (data.routeSnapshot) {
        setRouteSnapshots([data.routeSnapshot]);
      }

      setAdditionalStops(nextAdditionalStops);
      return true;
    } catch (error) {
      setPreviewError(error.message || "Could not preview this route.");
      return false;
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleAdditionalStopChange = (field, value) => {
    setAdditionalStopForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (field === "address") {
      if (selectedAdditionalPlace) {
        setAddressSessionToken(createSessionToken());
      }

      setSelectedAdditionalPlace(null);
      setAddressLookupError("");
      setPreviewError("");
    }
  };

  const handleAdditionalSuggestionSelect = async (suggestion) => {
    setIsLoadingAddressSuggestions(true);
    setAddressLookupError("");
    setPreviewError("");

    try {
      const response = await fetch("/api/preorder/address-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeId: suggestion.placeId,
          sessionToken: addressSessionToken,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Could not verify that address.");
      }

      setSelectedAdditionalPlace(data.place);
      setAdditionalStopForm((current) => ({
        ...current,
        address: data.place.formattedAddress,
      }));
      setAddressSuggestions([]);
    } catch (error) {
      setAddressLookupError(error.message || "Could not verify that address.");
    } finally {
      setIsLoadingAddressSuggestions(false);
    }
  };

  const handleAddAdditionalStop = async (event) => {
    event.preventDefault();

    const nextStop = {
      id: `additional-${Date.now()}`,
      name: additionalStopForm.name.trim(),
      phone: additionalStopForm.phone.trim(),
      email: additionalStopForm.email.trim(),
      address: additionalStopForm.address.trim(),
    };

    if (!nextStop.name || !nextStop.phone || !nextStop.email || !nextStop.address) {
      setPreviewError("Enter name, phone, email, and address for the additional stop.");
      return;
    }

    if (!selectedAdditionalPlace?.placeId) {
      setPreviewError("Choose the additional stop address from the suggestions.");
      return;
    }

    nextStop.address = selectedAdditionalPlace.formattedAddress || nextStop.address;

    const didPreview = await previewRoute([...additionalStops, nextStop]);

    if (didPreview) {
      setAdditionalStopForm(emptyAdditionalStopForm);
      setSelectedAdditionalPlace(null);
      setAddressSessionToken(createSessionToken());
      setAddressSuggestions([]);
      setAddressLookupError("");
    }
  };

  const handleRemoveAdditionalStop = async (additionalStopId) => {
    await previewRoute(additionalStops.filter((stop) => stop.id !== additionalStopId));
  };

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

  const handleMarkDelivered = async ({ routePlan, stop }) => {
    const sourceType = stop.routeSource === "subscription" ? "subscription" : "order_plan";
    const sourceId = stop.subscriptionId || stop.orderPlanId;
    const stopKey = `${routePlan.deliveryDate}-${sourceType}-${sourceId}`;

    if (!sourceId) {
      setInvoiceMessages((current) => ({
        ...current,
        [stopKey]: { type: "error", text: "Could not find the source order for this stop." },
      }));
      return;
    }

    setInvoicingStopKey(stopKey);
    setInvoiceMessages((current) => ({ ...current, [stopKey]: null }));

    try {
      const response = await fetch("/api/admin/invoices/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          sourceId,
          deliveryDate: toDateKey(routePlan.deliveryDate),
          deliveredAt: new Date().toISOString(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send invoice.");
      }

      const emailStatus = data.emailDelivery?.status || data.invoice?.emailStatus || "recorded";
      setInvoiceMessages((current) => ({
        ...current,
        [stopKey]: {
          type: emailStatus === "failed" ? "error" : "success",
          text:
            emailStatus === "already_created"
              ? `Invoice ${data.invoice?.invoiceNumber || ""} already exists.`
              : `Invoice ${data.invoice?.invoiceNumber || ""} ${emailStatus}.`,
        },
      }));
    } catch (error) {
      setInvoiceMessages((current) => ({
        ...current,
        [stopKey]: { type: "error", text: error.message || "Could not send invoice." },
      }));
    } finally {
      setInvoicingStopKey("");
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
          {routeSnapshots.length ? "1 run" : "0 runs"}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {routeSnapshots.length === 0 && (
          <div className="rounded-xl bg-base-200 p-4 text-sm opacity-70">
            No upcoming route runs have been generated yet.
          </div>
        )}

        {routeSnapshots.map((routePlan) => (
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

            <form className="mt-4 rounded-xl bg-base-100 p-4" onSubmit={handleAddAdditionalStop}>
              <div className="grid gap-3 lg:grid-cols-[minmax(140px,0.8fr)_minmax(120px,0.7fr)_minmax(160px,0.9fr)_minmax(220px,1.4fr)_auto]">
                <label className="form-control">
                  <div className="label py-0">
                    <span className="label-text">Name</span>
                  </div>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    value={additionalStopForm.name}
                    onChange={(event) => handleAdditionalStopChange("name", event.target.value)}
                  />
                </label>
                <label className="form-control">
                  <div className="label py-0">
                    <span className="label-text">Phone</span>
                  </div>
                  <input
                    type="tel"
                    className="input input-bordered input-sm"
                    value={additionalStopForm.phone}
                    onChange={(event) => handleAdditionalStopChange("phone", event.target.value)}
                  />
                </label>
                <label className="form-control">
                  <div className="label py-0">
                    <span className="label-text">Email</span>
                  </div>
                  <input
                    type="email"
                    className="input input-bordered input-sm"
                    value={additionalStopForm.email}
                    onChange={(event) => handleAdditionalStopChange("email", event.target.value)}
                  />
                </label>
                <label className="form-control">
                  <div className="label py-0">
                    <span className="label-text">Address</span>
                  </div>
                  <input
                    type="text"
                    className="input input-bordered input-sm"
                    value={additionalStopForm.address}
                    onChange={(event) => handleAdditionalStopChange("address", event.target.value)}
                    autoComplete="off"
                    placeholder="Start typing and choose a match"
                  />
                  {addressSuggestions.length > 0 && (
                    <div className="mt-2 rounded-2xl border border-base-300 bg-base-100 shadow-lg">
                      <ul className="max-h-72 overflow-y-auto py-2">
                        {addressSuggestions.map((suggestion) => (
                          <li key={suggestion.placeId}>
                            <button
                              type="button"
                              className="w-full px-4 py-3 text-left hover:bg-base-200"
                              onClick={() => handleAdditionalSuggestionSelect(suggestion)}
                            >
                              <div className="font-medium">{suggestion.primaryText}</div>
                              {suggestion.secondaryText && (
                                <div className="text-sm opacity-70">{suggestion.secondaryText}</div>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {isLoadingAddressSuggestions && additionalStopForm.address.trim().length >= 3 && (
                    <div className="mt-2 text-xs opacity-70">Looking up addresses...</div>
                  )}
                  {selectedAdditionalPlace?.formattedAddress && (
                    <div className="mt-2 text-xs text-success">Address selected from Google Maps.</div>
                  )}
                  {addressLookupError && (
                    <div className="mt-2 text-sm text-error">{addressLookupError}</div>
                  )}
                </label>
                <button type="submit" className="btn btn-primary btn-sm self-end" disabled={isPreviewing}>
                  {isPreviewing ? "Calculating..." : "Add stop"}
                </button>
              </div>
              {previewError && <div className="mt-3 text-sm text-error">{previewError}</div>}
            </form>

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
                    <div className="mt-1 text-xs opacity-60">
                      Includes {Number(routePlan.returnDistanceKm || 0).toFixed(1)} km return
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
                          <tr
                            key={`${routePlan.deliveryDate}-${
                              stop.subscriptionId || stop.orderPlanId || stop.additionalStopId
                            }`}
                          >
                            <td className="font-medium">{stop.stopNumber}</td>
                            <td>
                              {(() => {
                                const sourceId = stop.subscriptionId || stop.orderPlanId;
                                const sourceType = stop.routeSource === "subscription" ? "subscription" : "order_plan";
                                const stopKey = `${routePlan.deliveryDate}-${sourceType}-${sourceId}`;
                                const canInvoice =
                                  stop.routeSource === "subscription" ||
                                  (stop.routeSource === "order_plan" && stop.mode === "recurring");
                                const invoiceMessage = invoiceMessages[stopKey];

                                return (
                                  <>
                              <div className="font-medium">{stop.customerName}</div>
                              <div className="text-xs opacity-60">
                                {getRouteStopTypeLabel(stop)}
                                {stop.routeSource !== "additional" && stop.billingStatus
                                  ? ` - payment ${stop.billingStatus}`
                                  : ""}
                              </div>
                              {stop.routeSource !== "additional" && (
                                <div className="text-xs opacity-60">
                                  {formatCurrency(currency, stop.total || 0)}
                                </div>
                              )}
                              {stop.routeSource === "additional" && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs mt-1 text-error"
                                  disabled={isPreviewing}
                                  onClick={() => handleRemoveAdditionalStop(stop.additionalStopId)}
                                >
                                  Remove
                                </button>
                              )}
                              {canInvoice && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-xs mt-2"
                                  disabled={invoicingStopKey === stopKey}
                                  onClick={() => handleMarkDelivered({ routePlan, stop })}
                                >
                                  {invoicingStopKey === stopKey ? "Sending..." : "Mark delivered / invoice"}
                                </button>
                              )}
                              {invoiceMessage?.text && (
                                <div
                                  className={`mt-1 text-xs ${
                                    invoiceMessage.type === "error" ? "text-error" : "text-success"
                                  }`}
                                >
                                  {invoiceMessage.text}
                                </div>
                              )}
                                  </>
                                );
                              })()}
                            </td>
                            <td>{stop.phone}</td>
                            <td className="min-w-[260px]">{stop.address}</td>
                            <td>{stop.routeSource === "additional" ? "-" : formatSubscriptionCadence(stop.cadence)}</td>
                            <td className="text-right">{Number(stop.legDistanceKm || 0).toFixed(1)}</td>
                            <td className="text-right">
                              {Number(stop.cumulativeDistanceKm || 0).toFixed(1)}
                            </td>
                            <td className="text-right">{stop.routeSource === "additional" ? "-" : stop.totalQuantity}</td>
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
                        {Number(routePlan.returnDistanceKm || 0) > 0 && (
                          <tr key={`${routePlan.deliveryDate}-return`}>
                            <td className="font-medium">Return</td>
                            <td>
                              <div className="font-medium">Pickup point</div>
                              <div className="text-xs opacity-60">Compensated return leg</div>
                            </td>
                            <td>-</td>
                            <td className="min-w-[260px]">{routePlan.originAddress || "-"}</td>
                            <td>-</td>
                            <td className="text-right">
                              {Number(routePlan.returnDistanceKm || 0).toFixed(1)}
                            </td>
                            <td className="text-right">
                              {Number(routePlan.totalDistanceKm || 0).toFixed(1)}
                            </td>
                            <td className="text-right">-</td>
                            <td>-</td>
                          </tr>
                        )}
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

