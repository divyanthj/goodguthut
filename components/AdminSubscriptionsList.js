"use client";

import { useMemo, useState } from "react";
import {
  formatSubscriptionCadence,
  getSubscriptionSummaryCounts,
  SUBSCRIPTION_STATUSES,
} from "@/libs/subscriptions";

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatCurrency = (currency, amount) =>
  `${currency || "INR"} ${Number(amount || 0).toFixed(2)}`;

export default function AdminSubscriptionsList({ initialSubscriptions }) {
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const summary = useMemo(
    () => getSubscriptionSummaryCounts(subscriptions),
    [subscriptions]
  );

  const saveStatus = async (subscriptionId, status) => {
    setSavingId(subscriptionId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update subscription.");
      }

      setSubscriptions((current) =>
        current.map((subscription) =>
          subscription.id === subscriptionId ? data.subscription : subscription
        )
      );
      setMessage("Subscription status updated.");
    } catch (updateError) {
      setError(updateError.message || "Could not update subscription.");
    } finally {
      setSavingId("");
    }
  };

  const deleteSubscription = async (subscriptionId) => {
    const shouldDelete = window.confirm("Delete this subscription permanently?");

    if (!shouldDelete) {
      return;
    }

    setDeletingId(subscriptionId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete subscription.");
      }

      setSubscriptions((current) =>
        current.filter((subscription) => subscription.id !== subscriptionId)
      );
      setMessage("Subscription deleted.");
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete subscription.");
    } finally {
      setDeletingId("");
    }
  };

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-2xl bg-base-100 p-8 shadow-md">
        <p className="text-lg font-medium">No subscriptions yet.</p>
        <p className="mt-2 opacity-70">Requests from the public subscriptions page will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Subscription summary</h2>
            <p className="text-sm opacity-70">
              Track customer lifecycle and recurring billing activation at a glance.
            </p>
          </div>
          <div className="badge badge-outline">{summary.total} total</div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {SUBSCRIPTION_STATUSES.map((status) => (
            <div key={status.value} className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="text-xs uppercase tracking-[0.16em] opacity-60">{status.label}</div>
              <div className="mt-2 text-2xl font-semibold">{summary[status.value] || 0}</div>
            </div>
          ))}
        </div>
      </section>

      {subscriptions.map((subscription) => (
        <article key={subscription.id} className="rounded-2xl bg-base-100 p-5 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{subscription.name}</h2>
              <p className="text-sm opacity-75">{subscription.email}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] opacity-60">
                Created {formatDate(subscription.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="badge badge-outline">{formatSubscriptionCadence(subscription.cadence)}</div>
              <div className="badge badge-outline">
                billing: {subscription.billing?.status || "not_configured"}
              </div>
              <select
                className="select select-bordered select-sm"
                value={subscription.status}
                disabled={savingId === subscription.id || deletingId === subscription.id}
                onChange={(event) => saveStatus(subscription.id, event.target.value)}
              >
                {SUBSCRIPTION_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error"
                disabled={deletingId === subscription.id}
                onClick={() => deleteSubscription(subscription.id)}
              >
                {deletingId === subscription.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)]">
            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-medium">Lineup</div>
                <div className="text-xs opacity-60">{subscription.totalQuantity} bottles</div>
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
                    {(subscription.items || []).map((item) => (
                      <tr key={`${subscription.id}-${item.sku}`}>
                        <td>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs opacity-60">{item.sku}</div>
                        </td>
                        <td>{item.quantity}</td>
                        <td className="text-right">
                          {formatCurrency(subscription.currency, item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-base-200 p-4 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Phone</div>
                    <div className="mt-1">{subscription.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Cadence</div>
                    <div className="mt-1">{formatSubscriptionCadence(subscription.cadence)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Subtotal</div>
                    <div className="mt-1">{formatCurrency(subscription.currency, subscription.subtotal)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery fee</div>
                    <div className="mt-1">{formatCurrency(subscription.currency, subscription.deliveryFee)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Total</div>
                    <div className="mt-1 font-medium">{formatCurrency(subscription.currency, subscription.total)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Distance</div>
                    <div className="mt-1">{Number(subscription.deliveryDistanceKm || 0).toFixed(1)} km</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery address</div>
                    <div className="mt-1">{subscription.normalizedDeliveryAddress || subscription.address}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-base-200 p-4 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Razorpay subscription</div>
                    <div className="mt-1 break-all">{subscription.billing?.subscriptionId || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Plan</div>
                    <div className="mt-1 break-all">{subscription.billing?.planId || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Paid count</div>
                    <div className="mt-1">{subscription.billing?.paidCount || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Last contacted</div>
                    <div className="mt-1">{formatDate(subscription.lastContactedAt)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Setup link</div>
                    <div className="mt-1 break-all">
                      {subscription.billing?.shortUrl ? (
                        <a
                          className="link link-primary"
                          href={subscription.billing.shortUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {subscription.billing.shortUrl}
                        </a>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <a className="btn btn-outline btn-sm" href={`mailto:${subscription.email}`}>
                    Email subscriber
                  </a>
                </div>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
