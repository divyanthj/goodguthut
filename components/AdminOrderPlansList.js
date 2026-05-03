"use client";

import { useMemo, useState } from "react";
import { getOrderPlanDisplayStatus } from "@/libs/order-plans";
import { formatSubscriptionCadence, formatSubscriptionDuration } from "@/libs/subscriptions";
import { formatSubscriptionDate } from "@/libs/subscription-schedule";

const formatCurrency = (currency, amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
};

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const toDateTimeLocal = (value) => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const modeLabel = (mode = "") => (mode === "recurring" ? "Recurring" : "One-time");

const normalizePlanForDisplay = (plan = {}) => {
  return {
    ...plan,
    status: getOrderPlanDisplayStatus({ mode: plan.mode, status: plan.status }),
  };
};

const getSelectionSummary = (plan = {}) => {
  const items = Array.isArray(plan.items) ? plan.items : [];

  if (items.length > 0) {
    return items.map((item) => `${item.productName} x ${item.quantity}`).join(", ");
  }

  if (plan.selectionMode === "combo") {
    return plan.comboName || "Combo";
  }

  return "Custom lineup";
};

export default function AdminOrderPlansList({ initialOrderPlans = [] }) {
  const [orderPlans, setOrderPlans] = useState(() =>
    (initialOrderPlans || []).map((plan) => normalizePlanForDisplay(plan))
  );
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [showFulfilledOrders, setShowFulfilledOrders] = useState(false);

  const fulfilledOrderCount = useMemo(
    () => orderPlans.filter((plan) => plan.status === "fulfilled").length,
    [orderPlans]
  );

  const activeOrderPlans = useMemo(
    () => orderPlans.filter((plan) => plan.status !== "fulfilled"),
    [orderPlans]
  );

  const fulfilledOrderPlans = useMemo(
    () => orderPlans.filter((plan) => plan.status === "fulfilled"),
    [orderPlans]
  );

  const summary = useMemo(
    () => ({
      total: activeOrderPlans.length,
      oneTime: activeOrderPlans.filter((plan) => plan.mode === "one_time").length,
      recurring: activeOrderPlans.filter((plan) => plan.mode === "recurring").length,
    }),
    [activeOrderPlans]
  );

  const patchOrder = async (id, payload, fallbackError) => {
    setSavingId(id);
    setError("");

    try {
      const response = await fetch(`/api/admin/order-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || fallbackError);
      }

      setOrderPlans((current) =>
        current.map((entry) =>
          entry.id === id ? normalizePlanForDisplay(data.orderPlan) : entry
        )
      );
    } catch (updateError) {
      setError(updateError.message || fallbackError);
    } finally {
      setSavingId("");
    }
  };

  const markShipped = async (id, trackingLink) => {
    await patchOrder(
      id,
      {
        markShipped: true,
        trackingLink,
      },
      "Could not mark order as shipped."
    );
  };

  const markDelivered = async (id, deliveredAt) => {
    await patchOrder(
      id,
      {
        markDelivered: true,
        deliveredAt,
      },
      "Could not mark order as delivered."
    );
  };

  const deleteOrder = async (id) => {
    const shouldDelete = window.confirm("Delete this order permanently?");

    if (!shouldDelete) {
      return;
    }

    setDeletingId(id);
    setError("");

    try {
      const response = await fetch(`/api/admin/order-plans/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete order.");
      }

      setOrderPlans((current) => current.filter((entry) => entry.id !== id));
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete order.");
    } finally {
      setDeletingId("");
    }
  };

  if (orderPlans.length === 0) {
    return (
      <section className="rounded-2xl bg-base-100 p-8 shadow-md">
        <p className="text-lg font-medium">No orders yet.</p>
        <p className="mt-2 opacity-70">New customer orders will appear here automatically.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">Total</div>
          <div className="mt-1 text-2xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">One-time</div>
          <div className="mt-1 text-2xl font-semibold">{summary.oneTime}</div>
        </div>
        <div className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="text-sm opacity-70">Recurring</div>
          <div className="mt-1 text-2xl font-semibold">{summary.recurring}</div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {activeOrderPlans.map((plan) => {
        const isOneTime = plan.mode === "one_time";
        const trackingInputId = `order-plan-tracking-link-${plan.id}`;
        const deliveredAtInputId = `order-plan-delivered-at-${plan.id}`;
        const canMarkShipped = isOneTime && plan.status === "confirmed";
        const canMarkDelivered =
          isOneTime && (plan.status === "confirmed" || plan.status === "shipped");

        return (
          <article key={plan.id} className="rounded-2xl bg-base-100 p-5 shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="text-sm opacity-75">{plan.email}</p>
                <p className="text-sm opacity-75">{plan.phone}</p>
                <p className="mt-1 text-xs opacity-60">Created {formatDateTime(plan.createdAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="badge badge-outline">{modeLabel(plan.mode)}</div>
                <div className="badge badge-outline">{plan.status}</div>
                <div className="badge badge-outline">payment: {plan.payment?.status || "-"}</div>
                {isOneTime ? (
                  <div className="badge badge-outline">qty {plan.totalQuantity || 0}</div>
                ) : (
                  <>
                    <div className="badge badge-outline">{formatSubscriptionCadence(plan.cadence)}</div>
                    <div className="badge badge-outline">{formatSubscriptionDuration(plan.durationWeeks)}</div>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm text-error"
                  disabled={deletingId === plan.id}
                  onClick={() => deleteOrder(plan.id)}
                >
                  {deletingId === plan.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>

            {isOneTime ? (
              <>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
                  <div className="rounded-xl bg-base-200 p-4 text-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-medium">Items</div>
                      <div className="text-xs opacity-60">{getSelectionSummary(plan)}</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th className="text-right">Line total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(plan.items) && plan.items.length > 0 ? (
                            plan.items.map((item) => (
                              <tr key={`${plan.id}-${item.sku}`}>
                                <td>
                                  <div className="font-medium">{item.productName}</div>
                                  <div className="text-xs opacity-60">{item.sku}</div>
                                </td>
                                <td>{item.quantity}</td>
                                <td className="text-right">
                                  {formatCurrency(plan.currency, item.lineTotal)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="py-4 text-center opacity-70">
                                No SKU breakdown was saved for this order.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl bg-base-200 p-4 text-sm">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">First delivery</div>
                          <div className="mt-1">{formatSubscriptionDate(plan.firstDeliveryDate || plan.startDate) || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Next delivery</div>
                          <div className="mt-1">{formatSubscriptionDate(plan.nextDeliveryDate) || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Shipped at</div>
                          <div className="mt-1">{formatDateTime(plan.shipment?.shippedAt)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivered at</div>
                          <div className="mt-1">{formatDateTime(plan.deliveredAt)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Subtotal</div>
                          <div className="mt-1">{formatCurrency(plan.currency, plan.subtotal)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery fee</div>
                          <div className="mt-1">{formatCurrency(plan.currency, plan.deliveryFee)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Total</div>
                          <div className="mt-1 font-medium">{formatCurrency(plan.currency, plan.total)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Distance</div>
                          <div className="mt-1">{Number(plan.deliveryDistanceKm || 0).toFixed(1)} km</div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Tracking</div>
                          <div className="mt-1 break-all">
                            {plan.shipment?.trackingLink ? (
                              <a
                                className="link link-primary"
                                href={plan.shipment.trackingLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {plan.shipment.trackingLink}
                              </a>
                            ) : plan.shipment?.estimatedArrivalAt ? (
                              `Estimated arrival around ${formatDateTime(plan.shipment.estimatedArrivalAt)}`
                            ) : (
                              "-"
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-base-200 p-4 text-sm">
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery address</div>
                      <div className="mt-1">{plan.normalizedDeliveryAddress || plan.address || "-"}</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Phone</div>
                          <div className="mt-1">{plan.phone}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] opacity-60">Email</div>
                          <div className="mt-1">{plan.email || "-"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-base-200 p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="form-control min-w-[280px] flex-1">
                      <div className="label py-0">
                        <span className="label-text">Tracking link (optional)</span>
                      </div>
                      <input
                        type="url"
                        className="input input-bordered"
                        defaultValue={plan.shipment?.trackingLink || ""}
                        id={trackingInputId}
                        placeholder="https://..."
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={
                        savingId === plan.id ||
                        deletingId === plan.id ||
                        !canMarkShipped
                      }
                      onClick={() => {
                        const element = document.getElementById(trackingInputId);
                        markShipped(plan.id, element?.value || "");
                      }}
                    >
                      {savingId === plan.id ? "Saving..." : "Mark as shipped"}
                    </button>
                    <label className="form-control">
                      <div className="label py-0">
                        <span className="label-text">Delivered at</span>
                      </div>
                      <input
                        type="datetime-local"
                        className="input input-bordered"
                        defaultValue={toDateTimeLocal(plan.deliveredAt || new Date())}
                        id={deliveredAtInputId}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={
                        savingId === plan.id ||
                        deletingId === plan.id ||
                        !canMarkDelivered
                      }
                      onClick={() => {
                        const element = document.getElementById(deliveredAtInputId);
                        markDelivered(plan.id, element?.value || "");
                      }}
                    >
                      {savingId === plan.id ? "Saving..." : "Mark as delivered"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <div className="opacity-70">Delivery address</div>
                  <div className="mt-1">{plan.normalizedDeliveryAddress || plan.address || "-"}</div>
                </div>
                <div>
                  <div className="opacity-70">First delivery</div>
                  <div className="mt-1">{formatSubscriptionDate(plan.firstDeliveryDate || plan.startDate) || "-"}</div>
                </div>
                <div>
                  <div className="opacity-70">Next delivery</div>
                  <div className="mt-1">{formatSubscriptionDate(plan.nextDeliveryDate) || "-"}</div>
                </div>
                <div>
                  <div className="opacity-70">Amount</div>
                  <div className="mt-1 font-medium">{formatCurrency(plan.currency, plan.total)}</div>
                </div>
                <div>
                  <div className="opacity-70">Payment status</div>
                  <div className="mt-1">{plan.payment?.status || "-"}</div>
                </div>
                <div>
                  <div className="opacity-70">Selection</div>
                  <div className="mt-1">{getSelectionSummary(plan)}</div>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {fulfilledOrderCount > 0 && (
        <section className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm opacity-70">
              {fulfilledOrderCount} fulfilled unified order(s) are hidden here. The fulfilled count below is for earlier pre-orders only.
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowFulfilledOrders((current) => !current)}
            >
              {showFulfilledOrders
                ? `Hide fulfilled unified orders (${fulfilledOrderCount})`
                : `Show fulfilled unified orders (${fulfilledOrderCount})`}
            </button>
          </div>
        </section>
      )}

      {showFulfilledOrders &&
        fulfilledOrderPlans.map((plan) => {
              const isOneTime = plan.mode === "one_time";
              const trackingInputId = `order-plan-tracking-link-${plan.id}`;
              const deliveredAtInputId = `order-plan-delivered-at-${plan.id}`;
              const canMarkShipped = isOneTime && plan.status === "confirmed";
              const canMarkDelivered =
                isOneTime && (plan.status === "confirmed" || plan.status === "shipped");

              return (
                <article key={plan.id} className="rounded-2xl bg-base-100 p-5 shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">{plan.name}</h2>
                      <p className="text-sm opacity-75">{plan.email}</p>
                      <p className="text-sm opacity-75">{plan.phone}</p>
                      <p className="mt-1 text-xs opacity-60">Created {formatDateTime(plan.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="badge badge-outline">{modeLabel(plan.mode)}</div>
                      <div className="badge badge-outline">{plan.status}</div>
                      <div className="badge badge-outline">payment: {plan.payment?.status || "-"}</div>
                      {isOneTime ? (
                        <div className="badge badge-outline">qty {plan.totalQuantity || 0}</div>
                      ) : (
                        <>
                          <div className="badge badge-outline">{formatSubscriptionCadence(plan.cadence)}</div>
                          <div className="badge badge-outline">{formatSubscriptionDuration(plan.durationWeeks)}</div>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline btn-sm text-error"
                        disabled={deletingId === plan.id}
                        onClick={() => deleteOrder(plan.id)}
                      >
                        {deletingId === plan.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  {isOneTime ? (
                    <>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
                        <div className="rounded-xl bg-base-200 p-4 text-sm">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-medium">Items</div>
                            <div className="text-xs opacity-60">{getSelectionSummary(plan)}</div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="table table-sm">
                              <thead>
                                <tr>
                                  <th>Item</th>
                                  <th>Qty</th>
                                  <th className="text-right">Line total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.isArray(plan.items) && plan.items.length > 0 ? (
                                  plan.items.map((item) => (
                                    <tr key={`${plan.id}-${item.sku}`}>
                                      <td>
                                        <div className="font-medium">{item.productName}</div>
                                        <div className="text-xs opacity-60">{item.sku}</div>
                                      </td>
                                      <td>{item.quantity}</td>
                                      <td className="text-right">
                                        {formatCurrency(plan.currency, item.lineTotal)}
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={3} className="py-4 text-center opacity-70">
                                      No SKU breakdown was saved for this order.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-xl bg-base-200 p-4 text-sm">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">First delivery</div>
                                <div className="mt-1">{formatSubscriptionDate(plan.firstDeliveryDate || plan.startDate) || "-"}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Next delivery</div>
                                <div className="mt-1">{formatSubscriptionDate(plan.nextDeliveryDate) || "-"}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Shipped at</div>
                                <div className="mt-1">{formatDateTime(plan.shipment?.shippedAt)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivered at</div>
                                <div className="mt-1">{formatDateTime(plan.deliveredAt)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Subtotal</div>
                                <div className="mt-1">{formatCurrency(plan.currency, plan.subtotal)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery fee</div>
                                <div className="mt-1">{formatCurrency(plan.currency, plan.deliveryFee)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Total</div>
                                <div className="mt-1 font-medium">{formatCurrency(plan.currency, plan.total)}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Distance</div>
                                <div className="mt-1">{Number(plan.deliveryDistanceKm || 0).toFixed(1)} km</div>
                              </div>
                              <div className="sm:col-span-2">
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Tracking</div>
                                <div className="mt-1 break-all">
                                  {plan.shipment?.trackingLink ? (
                                    <a
                                      className="link link-primary"
                                      href={plan.shipment.trackingLink}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {plan.shipment.trackingLink}
                                    </a>
                                  ) : plan.shipment?.estimatedArrivalAt ? (
                                    `Estimated arrival around ${formatDateTime(plan.shipment.estimatedArrivalAt)}`
                                  ) : (
                                    "-"
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl bg-base-200 p-4 text-sm">
                            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery address</div>
                            <div className="mt-1">{plan.normalizedDeliveryAddress || plan.address || "-"}</div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Phone</div>
                                <div className="mt-1">{plan.phone}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Email</div>
                                <div className="mt-1">{plan.email || "-"}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl bg-base-200 p-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="form-control min-w-[280px] flex-1">
                            <div className="label py-0">
                              <span className="label-text">Tracking link (optional)</span>
                            </div>
                            <input
                              type="url"
                              className="input input-bordered"
                              defaultValue={plan.shipment?.trackingLink || ""}
                              id={trackingInputId}
                              placeholder="https://..."
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={
                              savingId === plan.id ||
                              deletingId === plan.id ||
                              !canMarkShipped
                            }
                            onClick={() => {
                              const element = document.getElementById(trackingInputId);
                              markShipped(plan.id, element?.value || "");
                            }}
                          >
                            {savingId === plan.id ? "Saving..." : "Mark as shipped"}
                          </button>
                          <label className="form-control">
                            <div className="label py-0">
                              <span className="label-text">Delivered at</span>
                            </div>
                            <input
                              type="datetime-local"
                              className="input input-bordered"
                              defaultValue={toDateTimeLocal(plan.deliveredAt || new Date())}
                              id={deliveredAtInputId}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={
                              savingId === plan.id ||
                              deletingId === plan.id ||
                              !canMarkDelivered
                            }
                            onClick={() => {
                              const element = document.getElementById(deliveredAtInputId);
                              markDelivered(plan.id, element?.value || "");
                            }}
                          >
                            {savingId === plan.id ? "Saving..." : "Mark as delivered"}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                      <div>
                        <div className="opacity-70">Delivery address</div>
                        <div className="mt-1">{plan.normalizedDeliveryAddress || plan.address || "-"}</div>
                      </div>
                      <div>
                        <div className="opacity-70">First delivery</div>
                        <div className="mt-1">{formatSubscriptionDate(plan.firstDeliveryDate || plan.startDate) || "-"}</div>
                      </div>
                      <div>
                        <div className="opacity-70">Next delivery</div>
                        <div className="mt-1">{formatSubscriptionDate(plan.nextDeliveryDate) || "-"}</div>
                      </div>
                      <div>
                        <div className="opacity-70">Amount</div>
                        <div className="mt-1 font-medium">{formatCurrency(plan.currency, plan.total)}</div>
                      </div>
                      <div>
                        <div className="opacity-70">Payment status</div>
                        <div className="mt-1">{plan.payment?.status || "-"}</div>
                      </div>
                      <div>
                        <div className="opacity-70">Selection</div>
                        <div className="mt-1">{getSelectionSummary(plan)}</div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
    </section>
  );
}
