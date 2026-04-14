"use client";

import { useMemo, useState } from "react";
import { ORDER_PLAN_STATUSES } from "@/libs/order-plans";
import { formatSubscriptionCadence, formatSubscriptionDuration } from "@/libs/subscriptions";
import { formatSubscriptionDate } from "@/libs/subscription-schedule";

const formatCurrency = (currency = "INR", value = 0) =>
  `${currency} ${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const modeLabel = (mode = "") => (mode === "recurring" ? "Recurring" : "One-time");

export default function AdminOrderPlansList({ initialOrderPlans = [] }) {
  const [orderPlans, setOrderPlans] = useState(initialOrderPlans);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  const summary = useMemo(
    () => ({
      total: orderPlans.length,
      oneTime: orderPlans.filter((plan) => plan.mode === "one_time").length,
      recurring: orderPlans.filter((plan) => plan.mode === "recurring").length,
    }),
    [orderPlans]
  );

  const saveStatus = async (id, status) => {
    setSavingId(id);
    setError("");

    try {
      const response = await fetch(`/api/admin/order-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update order.");
      }

      setOrderPlans((current) =>
        current.map((entry) => (entry.id === id ? data.orderPlan : entry))
      );
    } catch (updateError) {
      setError(updateError.message || "Could not update order.");
    } finally {
      setSavingId("");
    }
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

      {orderPlans.map((plan) => (
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
              <div className="badge badge-outline">payment: {plan.paymentType || plan.mode}</div>
              <select
                className="select select-bordered select-sm"
                value={plan.status}
                disabled={savingId === plan.id || deletingId === plan.id}
                onChange={(event) => saveStatus(plan.id, event.target.value)}
              >
                {ORDER_PLAN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
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
              <div className="mt-1">
                {plan.selectionMode === "combo"
                  ? plan.comboName || "Combo"
                  : "Custom"}
                {plan.mode === "recurring" ? ` • ${formatSubscriptionCadence(plan.cadence)} • ${formatSubscriptionDuration(plan.durationWeeks)}` : ""}
              </div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
