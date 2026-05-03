"use client";

import { useMemo, useState } from "react";
import {
  normalizeAdminOrderFromLegacyPreorder,
  normalizeAdminOrderFromOrderPlan,
} from "@/libs/admin-orders";
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

const formatDateOnly = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    dateStyle: "medium",
  });
};

const toDateTimeLocal = (value) => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const normalizeWhatsAppPhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }

  return digits;
};

const isMobileDevice = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
};

const buildWhatsAppUrl = (phone, message) => {
  const normalizedPhone = normalizeWhatsAppPhone(phone);

  if (!normalizedPhone || !message) {
    return "";
  }

  return `whatsapp://send?phone=${normalizedPhone}&text=${encodeURIComponent(message)}`;
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

const normalizeAdminOrder = (order = {}) => {
  if (order.sourceType === "legacy_preorder") {
    return normalizeAdminOrderFromLegacyPreorder(order);
  }

  return normalizeAdminOrderFromOrderPlan(order);
};

const getModeLabel = (order = {}) =>
  order.sourceType === "legacy_preorder"
    ? "One-time"
    : order.mode === "recurring"
      ? "Recurring"
      : "One-time";

const getTrackingInputId = (order = {}) => `tracking-link-${order.sourceType}-${order.id}`;
const getDeliveredAtInputId = (order = {}) => `delivered-at-${order.sourceType}-${order.id}`;

export default function AdminOrdersList({ initialOrders = [] }) {
  const [orders, setOrders] = useState(() => initialOrders || []);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showFulfilledOrders, setShowFulfilledOrders] = useState(false);

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "fulfilled"),
    [orders]
  );
  const fulfilledOrders = useMemo(
    () => orders.filter((order) => order.status === "fulfilled"),
    [orders]
  );
  const summary = useMemo(
    () => ({
      total: activeOrders.length,
      oneTime: activeOrders.filter(
        (order) =>
          order.sourceType === "legacy_preorder" || order.mode !== "recurring"
      ).length,
      recurring: activeOrders.filter(
        (order) =>
          order.sourceType === "order_plan" && order.mode === "recurring"
      ).length,
    }),
    [activeOrders]
  );

  const updateOrderInState = (sourceType, nextRecord) => {
    const normalized = normalizeAdminOrder({
      ...nextRecord,
      sourceType,
    });

    setOrders((current) =>
      current.map((entry) =>
        entry.id === normalized.id && entry.sourceType === sourceType
          ? normalized
          : entry
      )
    );
  };

  const patchOrder = async (order, payload, fallbackError) => {
    setSavingId(`${order.sourceType}:${order.id}`);
    setMessage("");
    setError("");

    const endpoint =
      order.sourceType === "legacy_preorder"
        ? `/api/admin/preorders/${order.id}`
        : `/api/admin/order-plans/${order.id}`;

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || fallbackError);
      }

      const nextRecord =
        order.sourceType === "legacy_preorder" ? data.preorder : data.orderPlan;

      if (nextRecord) {
        updateOrderInState(order.sourceType, nextRecord);
      }

      if (order.sourceType === "legacy_preorder" && payload.markShipped) {
        const whatsappMessage =
          data.notificationScaffold?.notifications?.whatsapp?.text || "";
        const whatsappPhone = data.preorder?.phone || "";
        const whatsappUrl = buildWhatsAppUrl(whatsappPhone, whatsappMessage);
        let clipboardCopied = false;

        if (whatsappMessage) {
          try {
            clipboardCopied = await copyToClipboard(whatsappMessage);
          } catch (clipboardError) {
            console.error("Could not copy shipped WhatsApp message", clipboardError);
          }
        }

        if (whatsappUrl && isMobileDevice()) {
          window.location.href = whatsappUrl;
        }

        const updatedPreorder = data.preorder || {};
        const isPickup = updatedPreorder.fulfillmentMethod === "pickup";
        const shipmentSummary = isPickup
          ? "Order marked ready for pickup."
          : payload.trackingLink?.trim()
            ? "Order marked as shipped and tracking link saved."
            : "Order marked as shipped and ETA set for 1 hour from shipment.";
        const whatsappSummary = whatsappUrl
          ? clipboardCopied
            ? isMobileDevice()
              ? " WhatsApp message copied to clipboard and opened in the WhatsApp app."
              : " WhatsApp message copied to clipboard."
            : isMobileDevice()
              ? " WhatsApp app opened with the message prefilled."
              : " WhatsApp message is ready to paste."
          : " No WhatsApp action was opened because this preorder has no phone number.";

        setMessage(`${shipmentSummary}${whatsappSummary}`);
      }
    } catch (updateError) {
      setError(updateError.message || fallbackError);
    } finally {
      setSavingId("");
    }
  };

  const deleteOrder = async (order) => {
    const shouldDelete = window.confirm("Delete this order permanently?");

    if (!shouldDelete) {
      return;
    }

    setDeletingId(`${order.sourceType}:${order.id}`);
    setMessage("");
    setError("");

    const endpoint =
      order.sourceType === "legacy_preorder"
        ? `/api/admin/preorders/${order.id}`
        : `/api/admin/order-plans/${order.id}`;

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete order.");
      }

      setOrders((current) =>
        current.filter(
          (entry) =>
            !(entry.id === order.id && entry.sourceType === order.sourceType)
        )
      );
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete order.");
    } finally {
      setDeletingId("");
    }
  };

  const markShipped = async (order, trackingLink) => {
    await patchOrder(
      order,
      {
        markShipped: true,
        trackingLink,
      },
      "Could not mark order as shipped."
    );
  };

  const markDelivered = async (order, deliveredAt) => {
    const payload =
      order.sourceType === "legacy_preorder"
        ? { deliveredAt }
        : { markDelivered: true, deliveredAt };

    await patchOrder(order, payload, "Could not mark order as delivered.");
  };

  const confirmLegacyPreorder = async (order) => {
    await patchOrder(
      order,
      { status: "confirmed" },
      "Could not confirm preorder."
    );
  };

  if (orders.length === 0) {
    return (
      <section className="rounded-2xl bg-base-100 p-8 shadow-md">
        <p className="text-lg font-medium">No orders yet.</p>
        <p className="mt-2 opacity-70">New customer orders will appear here automatically.</p>
      </section>
    );
  }

  const renderOneTimeOrder = (order) => {
    const trackingInputId = getTrackingInputId(order);
    const deliveredAtInputId = getDeliveredAtInputId(order);
    const isLegacy = order.sourceType === "legacy_preorder";
    const isPickup = order.fulfillmentMethod === "pickup";
    const canConfirmLegacy =
      isLegacy &&
      order.status === "pending" &&
      order.payment?.provider !== "razorpay";
    const canMarkShipped = order.status === "confirmed";
    const canMarkDelivered =
      order.status === "confirmed" || order.status === "shipped";

    return (
      <>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-medium">Items</div>
              <div className="text-xs opacity-60">
                {isLegacy ? order.preorderWindowLabel || "Legacy preorder" : order.selectionSummary}
              </div>
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
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((item) => (
                      <tr key={`${order.sourceType}-${order.id}-${item.sku}`}>
                        <td>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs opacity-60">{item.sku}</div>
                        </td>
                        <td>{item.quantity}</td>
                        <td className="text-right">
                          {formatCurrency(order.currency, item.lineTotal)}
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
                {isLegacy ? (
                  <>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Batch</div>
                      <div className="mt-1">{order.preorderWindowLabel || "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery date</div>
                      <div className="mt-1">{formatDateOnly(order.firstDeliveryDate)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">First delivery</div>
                      <div className="mt-1">
                        {formatSubscriptionDate(order.firstDeliveryDate || order.startDate) || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] opacity-60">Next delivery</div>
                      <div className="mt-1">{formatSubscriptionDate(order.nextDeliveryDate) || "-"}</div>
                    </div>
                  </>
                )}
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivered at</div>
                  <div className="mt-1">{formatDateTime(order.deliveredAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Shipped at</div>
                  <div className="mt-1">{formatDateTime(order.shippedAt)}</div>
                </div>
                {isLegacy && (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Confirmation</div>
                    <div className="mt-1">{order.confirmationLabel}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">
                    {isPickup ? "Pickup" : "Distance"}
                  </div>
                  <div className="mt-1">
                    {isPickup
                      ? "Free pickup"
                      : `${Number(order.deliveryDistanceKm || 0).toFixed(1)} km`}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Subtotal</div>
                  <div className="mt-1">{formatCurrency(order.currency, order.subtotal)}</div>
                </div>
                {isLegacy && (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Discount</div>
                    <div className="mt-1">
                      {order.discount?.discountAmount > 0
                        ? `${order.discount.code} (-${formatCurrency(
                            order.currency,
                            order.discount.discountAmount
                          )})`
                        : "-"}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery fee</div>
                  <div className="mt-1">{formatCurrency(order.currency, order.deliveryFee)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Total</div>
                  <div className="mt-1 font-medium">{formatCurrency(order.currency, order.total)}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Tracking</div>
                  <div className="mt-1 break-all">
                    {order.trackingLink ? (
                      <a
                        className="link link-primary"
                        href={order.trackingLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {order.trackingLink}
                      </a>
                    ) : order.estimatedArrivalAt ? (
                      `Estimated arrival around ${formatDateTime(order.estimatedArrivalAt)}`
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="text-xs uppercase tracking-[0.16em] opacity-60">
                {isPickup ? "Pickup address" : "Delivery address"}
              </div>
              <div className="mt-1">
                {isPickup
                  ? order.pickupAddressSnapshot || "-"
                  : order.normalizedDeliveryAddress || order.address || "-"}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Phone</div>
                  <div className="mt-1">{order.phone}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] opacity-60">Email</div>
                  <div className="mt-1">{order.email || "-"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-base-200 p-4">
          <div className="flex flex-wrap items-end gap-3">
            {!isPickup ? (
              <label className="form-control min-w-[280px] flex-1">
                <div className="label py-0">
                  <span className="label-text">Tracking link (optional)</span>
                </div>
                <input
                  type="url"
                  className="input input-bordered"
                  defaultValue={order.trackingLink || ""}
                  id={trackingInputId}
                  placeholder="https://..."
                />
              </label>
            ) : (
              <div className="min-w-[280px] flex-1 rounded-xl border border-base-300 bg-base-100 px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Pickup address</div>
                <div className="mt-1">{order.pickupAddressSnapshot || "-"}</div>
              </div>
            )}
            {canConfirmLegacy && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={
                  savingId === `${order.sourceType}:${order.id}` ||
                  deletingId === `${order.sourceType}:${order.id}`
                }
                onClick={() => confirmLegacyPreorder(order)}
              >
                {savingId === `${order.sourceType}:${order.id}` ? "Saving..." : "Confirm order"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={
                savingId === `${order.sourceType}:${order.id}` ||
                deletingId === `${order.sourceType}:${order.id}` ||
                !canMarkShipped
              }
              onClick={() => {
                const element = document.getElementById(trackingInputId);
                markShipped(order, element?.value || "");
              }}
            >
              {savingId === `${order.sourceType}:${order.id}`
                ? "Saving..."
                : isPickup
                  ? "Mark ready for pickup"
                  : "Mark as shipped"}
            </button>
            <label className="form-control">
              <div className="label py-0">
                <span className="label-text">Delivered at</span>
              </div>
              <input
                type="datetime-local"
                className="input input-bordered"
                defaultValue={toDateTimeLocal(order.deliveredAt || new Date())}
                id={deliveredAtInputId}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                savingId === `${order.sourceType}:${order.id}` ||
                deletingId === `${order.sourceType}:${order.id}` ||
                !canMarkDelivered
              }
              onClick={() => {
                const element = document.getElementById(deliveredAtInputId);
                markDelivered(order, element?.value || "");
              }}
            >
              {savingId === `${order.sourceType}:${order.id}` ? "Saving..." : "Mark as delivered"}
            </button>
          </div>
        </div>
      </>
    );
  };

  const renderRecurringOrder = (order) => (
    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
      <div>
        <div className="opacity-70">Delivery address</div>
        <div className="mt-1">{order.normalizedDeliveryAddress || order.address || "-"}</div>
      </div>
      <div>
        <div className="opacity-70">First delivery</div>
        <div className="mt-1">{formatSubscriptionDate(order.firstDeliveryDate || order.startDate) || "-"}</div>
      </div>
      <div>
        <div className="opacity-70">Next delivery</div>
        <div className="mt-1">{formatSubscriptionDate(order.nextDeliveryDate) || "-"}</div>
      </div>
      <div>
        <div className="opacity-70">Amount</div>
        <div className="mt-1 font-medium">{formatCurrency(order.currency, order.total)}</div>
      </div>
      <div>
        <div className="opacity-70">Payment status</div>
        <div className="mt-1">{order.payment?.status || "-"}</div>
      </div>
      <div>
        <div className="opacity-70">Selection</div>
        <div className="mt-1">{order.selectionSummary}</div>
      </div>
    </div>
  );

  const renderOrderCard = (order) => (
    <article
      key={`${order.sourceType}:${order.id}`}
      className="rounded-2xl bg-base-100 p-5 shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{order.customerName}</h2>
          <p className="text-sm opacity-75">{order.email || order.phone}</p>
          <p className="text-sm opacity-75">{order.phone}</p>
          <p className="mt-1 text-xs opacity-60">Created {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="badge badge-outline">{order.sourceLabel}</div>
          <div className="badge badge-outline">{getModeLabel(order)}</div>
          <div className="badge badge-outline">{order.status}</div>
          <div className="badge badge-outline">{order.paymentBadgeLabel}</div>
          {order.sourceType === "legacy_preorder" ? (
            <div className="badge badge-outline">
              {order.fulfillmentMethod === "pickup" ? "pickup" : "delivery"}
            </div>
          ) : order.mode === "recurring" ? (
            <>
              <div className="badge badge-outline">{formatSubscriptionCadence(order.cadence)}</div>
              <div className="badge badge-outline">{formatSubscriptionDuration(order.durationWeeks)}</div>
            </>
          ) : null}
          <div className="badge badge-outline">qty {order.totalQuantity || 0}</div>
          <button
            type="button"
            className="btn btn-outline btn-sm text-error"
            disabled={deletingId === `${order.sourceType}:${order.id}`}
            onClick={() => deleteOrder(order)}
          >
            {deletingId === `${order.sourceType}:${order.id}` ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {order.sourceType === "order_plan" && order.mode === "recurring"
        ? renderRecurringOrder(order)
        : renderOneTimeOrder(order)}
    </article>
  );

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

      {message && (
        <div className="alert alert-success">
          <span>{message}</span>
        </div>
      )}

      {activeOrders.map((order) => renderOrderCard(order))}

      {fulfilledOrders.length > 0 && (
        <section className="rounded-2xl bg-base-100 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm opacity-70">
              {fulfilledOrders.length} fulfilled order(s) are hidden to keep this list focused.
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setShowFulfilledOrders((current) => !current)}
            >
              {showFulfilledOrders
                ? `Hide fulfilled (${fulfilledOrders.length})`
                : `Show fulfilled (${fulfilledOrders.length})`}
            </button>
          </div>
        </section>
      )}

      {showFulfilledOrders && fulfilledOrders.map((order) => renderOrderCard(order))}
    </section>
  );
}
