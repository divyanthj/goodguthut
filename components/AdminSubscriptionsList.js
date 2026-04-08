"use client";

import { useMemo, useState } from "react";
import {
  formatSubscriptionCadence,
  formatSubscriptionDuration,
  formatSubscriptionSelectionMode,
  getSubscriptionSummaryCounts,
  SUBSCRIPTION_STATUSES,
} from "@/libs/subscriptions";
import { formatDeliveryDaysOfWeek } from "@/libs/subscription-delivery-days";
import {
  formatMinimumLeadDays,
  formatSubscriptionDate,
} from "@/libs/subscription-schedule";

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

const cadenceToWeeklyFactor = (cadence = "") => {
  switch (cadence) {
    case "weekly":
      return 1;
    case "fortnightly":
      return 0.5;
    case "monthly":
      return 0.25;
    default:
      return 0;
  }
};

const formatWeeklyEquivalent = (value) => Number(value || 0).toFixed(2);
const CONFIRMED_BILLING_STATUSES = new Set(["authenticated", "active", "pending", "completed"]);
const PENDING_BILLING_STATUSES = new Set(["created"]);
const EXCLUDED_STATUSES = new Set(["cancelled", "paused"]);

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
  const weeklyCommitmentsSummary = useMemo(() => {
    const items = new Map();
    let confirmedSubscriptionCount = 0;
    let pendingSubscriptionCount = 0;
    let confirmedWeeklyEquivalentBottles = 0;
    let pendingWeeklyEquivalentBottles = 0;
    let confirmedWeeklyEquivalentRevenue = 0;
    let pendingWeeklyEquivalentRevenue = 0;

    subscriptions
      .forEach((subscription) => {
        if (EXCLUDED_STATUSES.has(subscription.status)) {
          return;
        }

        const weeklyFactor = cadenceToWeeklyFactor(subscription.cadence);
        const billingStatus = subscription.billing?.status || "";
        const isConfirmed =
          subscription.status === "active" || CONFIRMED_BILLING_STATUSES.has(billingStatus);
        const isPending = !isConfirmed && PENDING_BILLING_STATUSES.has(billingStatus);

        if (weeklyFactor <= 0 || (!isConfirmed && !isPending)) {
          return;
        }

        if (isConfirmed) {
          confirmedSubscriptionCount += 1;
          confirmedWeeklyEquivalentBottles += Number(subscription.totalQuantity || 0) * weeklyFactor;
          confirmedWeeklyEquivalentRevenue += Number(subscription.total || 0) * weeklyFactor;
        } else if (isPending) {
          pendingSubscriptionCount += 1;
          pendingWeeklyEquivalentBottles += Number(subscription.totalQuantity || 0) * weeklyFactor;
          pendingWeeklyEquivalentRevenue += Number(subscription.total || 0) * weeklyFactor;
        }

        (subscription.items || []).forEach((item) => {
          const currentItem = items.get(item.sku) || {
            sku: item.sku,
            productName: item.productName,
            confirmedWeeklyEquivalentBottles: 0,
            pendingWeeklyEquivalentBottles: 0,
            confirmedSubscribers: 0,
            pendingSubscribers: 0,
          };

          if (isConfirmed) {
            currentItem.confirmedWeeklyEquivalentBottles += Number(item.quantity || 0) * weeklyFactor;
            currentItem.confirmedSubscribers += 1;
          } else if (isPending) {
            currentItem.pendingWeeklyEquivalentBottles += Number(item.quantity || 0) * weeklyFactor;
            currentItem.pendingSubscribers += 1;
          }
          items.set(item.sku, currentItem);
        });
      });

    return {
      confirmedSubscriptionCount,
      pendingSubscriptionCount,
      confirmedWeeklyEquivalentBottles,
      pendingWeeklyEquivalentBottles,
      confirmedWeeklyEquivalentRevenue,
      pendingWeeklyEquivalentRevenue,
      items: [...items.values()].sort((left, right) =>
        left.productName.localeCompare(right.productName)
      ),
    };
  }, [subscriptions]);

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
    const shouldDelete = window.confirm(
      "Delete this subscription permanently? Any live Razorpay mandate will be cancelled first."
    );

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

      <section className="rounded-2xl bg-base-100 p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Weekly production summary</h2>
            <p className="text-sm opacity-70">
              Fortnightly counts as half a weekly run, and monthly counts as one quarter. Use confirmed bottles to plan this week&apos;s production and shipping; pending is your near-term pipeline.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Confirmed this week</div>
            <div className="mt-2 text-2xl font-semibold">
              {formatWeeklyEquivalent(weeklyCommitmentsSummary.confirmedWeeklyEquivalentBottles)}
            </div>
            <div className="mt-1 opacity-70">
              {weeklyCommitmentsSummary.confirmedSubscriptionCount} subscription(s)
            </div>
          </div>
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Pending this week</div>
            <div className="mt-2 text-2xl font-semibold">
              {formatWeeklyEquivalent(weeklyCommitmentsSummary.pendingWeeklyEquivalentBottles)}
            </div>
            <div className="mt-1 opacity-70">
              {weeklyCommitmentsSummary.pendingSubscriptionCount} subscription(s)
            </div>
          </div>
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Confirmed revenue</div>
            <div className="mt-2 text-2xl font-semibold">
              {formatCurrency("INR", weeklyCommitmentsSummary.confirmedWeeklyEquivalentRevenue)}
            </div>
          </div>
          <div className="rounded-xl bg-base-200 p-4 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] opacity-60">Pending revenue</div>
            <div className="mt-2 text-2xl font-semibold">
              {formatCurrency("INR", weeklyCommitmentsSummary.pendingWeeklyEquivalentRevenue)}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="text-right">Confirmed subscribers</th>
                <th className="text-right">Confirmed bottles</th>
                <th className="text-right">Pending subscribers</th>
                <th className="text-right">Pending bottles</th>
              </tr>
            </thead>
            <tbody>
              {weeklyCommitmentsSummary.items.length > 0 ? (
                weeklyCommitmentsSummary.items.map((item) => (
                  <tr key={`weekly-summary-${item.sku}`}>
                    <td>{item.sku}</td>
                    <td>{item.productName}</td>
                    <td className="text-right">{item.confirmedSubscribers}</td>
                    <td className="text-right font-medium">
                      {formatWeeklyEquivalent(item.confirmedWeeklyEquivalentBottles)}
                    </td>
                    <td className="text-right">{item.pendingSubscribers}</td>
                    <td className="text-right font-medium">
                      {formatWeeklyEquivalent(item.pendingWeeklyEquivalentBottles)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center opacity-70">
                    No weekly commitments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                {formatSubscriptionDuration(subscription.durationWeeks)}
              </div>
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
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Duration</div>
                    <div className="mt-1">{formatSubscriptionDuration(subscription.durationWeeks)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Selection</div>
                    <div className="mt-1">
                      {subscription.comboName || formatSubscriptionSelectionMode(subscription.selectionMode)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery days</div>
                    <div className="mt-1">{formatDeliveryDaysOfWeek(subscription.deliveryDaysOfWeek || [])}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Lead time</div>
                    <div className="mt-1">{formatMinimumLeadDays(subscription.minimumLeadDays || 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">First delivery</div>
                    <div className="mt-1">{formatSubscriptionDate(subscription.firstDeliveryDate || subscription.startDate) || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Next delivery</div>
                    <div className="mt-1">{formatSubscriptionDate(subscription.nextDeliveryDate) || "-"}</div>
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
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Mandate ends</div>
                    <div className="mt-1">{formatDate(subscription.billing?.mandateEndsAt || subscription.billing?.endAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Last contacted</div>
                    <div className="mt-1">{formatDate(subscription.lastContactedAt)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Setup link</div>
                    <div className="mt-1 break-all">
                      {subscription.billing?.status === "cancelled" ? (
                        "Subscription cancelled"
                      ) : subscription.billing?.shortUrl ? (
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
