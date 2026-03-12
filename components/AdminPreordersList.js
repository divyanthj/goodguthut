"use client";

import { useMemo, useState } from "react";

const formatCurrency = (currency, amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getPaymentBadgeLabel = (preorder) => {
  if (preorder.payment?.provider === "razorpay") {
    if (preorder.payment?.status === "paid") {
      return "payment: paid via Razorpay";
    }

    if (preorder.payment?.status === "order_created") {
      return "payment: checkout started";
    }

    if (preorder.payment?.status === "failed") {
      return "payment: Razorpay failed";
    }

    return "payment: awaiting Razorpay";
  }

  return "payment: manual after confirmation";
};

const toDateTimeLocal = (value) => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function AdminPreordersList({ initialPreorders }) {
  const [preorders, setPreorders] = useState(initialPreorders);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const confirmedProductionSummary = useMemo(() => {
    const batches = new Map();

    preorders
      .filter((preorder) => preorder.status === "confirmed" || preorder.status === "fulfilled")
      .forEach((preorder) => {
        const batchKey = preorder.preorderWindow || preorder.preorderWindowLabel || "unassigned";
        const existingBatch = batches.get(batchKey) || {
          batchKey,
          batchLabel: preorder.preorderWindowLabel || "Unassigned batch",
          deliveryDate: preorder.deliveryDate,
          confirmedOrderCount: 0,
          totalBottles: 0,
          items: new Map(),
        };

        existingBatch.confirmedOrderCount += 1;

        preorder.items.forEach((item) => {
          const currentItem = existingBatch.items.get(item.sku) || {
            sku: item.sku,
            productName: item.productName,
            bottles: 0,
          };

          currentItem.bottles += Number(item.quantity || 0);
          existingBatch.totalBottles += Number(item.quantity || 0);
          existingBatch.items.set(item.sku, currentItem);
        });

        batches.set(batchKey, existingBatch);
      });

    return [...batches.values()]
      .map((batch) => ({
        ...batch,
        items: [...batch.items.values()].sort((left, right) => left.productName.localeCompare(right.productName)),
      }))
      .sort((left, right) => new Date(left.deliveryDate || 0).getTime() - new Date(right.deliveryDate || 0).getTime());
  }, [preorders]);

  const updateStatus = async (preorderId, status) => {
    setSavingId(preorderId);
    setError("");

    try {
      const response = await fetch(`/api/admin/preorders/${preorderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update preorder.");
      }

      setPreorders((current) =>
        current.map((preorder) =>
          preorder.id === preorderId ? data.preorder : preorder
        )
      );
    } catch (updateError) {
      setError(updateError.message || "Could not update preorder.");
    } finally {
      setSavingId("");
    }
  };

  const markDelivered = async (preorderId, deliveredAt) => {
    setSavingId(preorderId);
    setError("");

    try {
      const response = await fetch(`/api/admin/preorders/${preorderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deliveredAt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update preorder.");
      }

      setPreorders((current) =>
        current.map((preorder) =>
          preorder.id === preorderId ? data.preorder : preorder
        )
      );
    } catch (updateError) {
      setError(updateError.message || "Could not update preorder.");
    } finally {
      setSavingId("");
    }
  };

  const deletePreorder = async (preorderId) => {
    const shouldDelete = window.confirm("Delete this preorder permanently?");

    if (!shouldDelete) {
      return;
    }

    setDeletingId(preorderId);
    setError("");

    try {
      const response = await fetch(`/api/admin/preorders/${preorderId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete preorder.");
      }

      setPreorders((current) => current.filter((preorder) => preorder.id !== preorderId));
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete preorder.");
    } finally {
      setDeletingId("");
    }
  };

  if (preorders.length === 0) {
    return (
      <div className="rounded-2xl bg-base-100 p-8 shadow-md">
        <p className="text-lg font-medium">No preorders yet.</p>
        <p className="mt-2 opacity-70">Orders submitted from the landing page will appear here.</p>
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

      {confirmedProductionSummary.length > 0 && (
        <section className="rounded-2xl bg-base-100 p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Confirmed production summary</h2>
              <p className="text-sm opacity-70">
                Bottle counts are based only on confirmed and fulfilled preorders. Each quantity equals one 200 ml bottle.
              </p>
            </div>
            <div className="badge badge-outline">
              {confirmedProductionSummary.reduce((sum, batch) => sum + batch.totalBottles, 0)} bottles committed
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {confirmedProductionSummary.map((batch) => (
              <div key={batch.batchKey} className="rounded-xl bg-base-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{batch.batchLabel}</div>
                    <div className="text-sm opacity-70">Delivery: {formatDate(batch.deliveryDate)}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>{batch.confirmedOrderCount} confirmed order(s)</div>
                    <div className="font-medium">{batch.totalBottles} bottles</div>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Product</th>
                        <th className="text-right">Bottles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.items.map((item) => (
                        <tr key={`${batch.batchKey}-${item.sku}`}>
                          <td>{item.sku}</td>
                          <td>{item.productName}</td>
                          <td className="text-right font-medium">{item.bottles}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {preorders.map((preorder) => (
        <article key={preorder.id} className="rounded-2xl bg-base-100 p-5 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{preorder.customerName}</h2>
              <p className="text-sm opacity-75">{preorder.email || preorder.phone}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] opacity-60">
                Placed {formatDate(preorder.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="badge badge-outline">{preorder.status}</div>
              <div className="badge badge-outline">{getPaymentBadgeLabel(preorder)}</div>
              <div className="badge badge-outline">qty {preorder.totalQuantity}</div>
              {preorder.status === "pending" && preorder.payment?.provider !== "razorpay" && (
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  disabled={savingId === preorder.id || deletingId === preorder.id}
                  onClick={() => updateStatus(preorder.id, "confirmed")}
                >
                  {savingId === preorder.id ? "Saving..." : "Confirm order"}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error"
                disabled={deletingId === preorder.id}
                onClick={() => deletePreorder(preorder.id)}
              >
                {deletingId === preorder.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-medium">Items</div>
                <div className="text-xs opacity-60">{preorder.preorderWindowLabel || "No batch label"}</div>
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
                    {preorder.items.map((item) => (
                      <tr key={`${preorder.id}-${item.sku}`}>
                        <td>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs opacity-60">{item.sku}</div>
                        </td>
                        <td>{item.quantity}</td>
                        <td className="text-right">{formatCurrency(preorder.currency, item.lineTotal)}</td>
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
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Batch</div>
                    <div className="mt-1">{preorder.preorderWindowLabel || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery date</div>
                    <div className="mt-1">{formatDate(preorder.deliveryDate)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivered at</div>
                    <div className="mt-1">{formatDate(preorder.deliveredAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Confirmation</div>
                    <div className="mt-1">{preorder.status === "confirmed" || preorder.status === "fulfilled" ? "Confirmed" : "Awaiting contact"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Distance</div>
                    <div className="mt-1">{Number(preorder.deliveryDistanceKm || 0).toFixed(1)} km</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Subtotal</div>
                    <div className="mt-1">{formatCurrency(preorder.currency, preorder.subtotal)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Total</div>
                    <div className="mt-1 font-medium">{formatCurrency(preorder.currency, preorder.total || preorder.subtotal)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-base-200 p-4 text-sm">
                <div className="text-xs uppercase tracking-[0.16em] opacity-60">Delivery address</div>
                <div className="mt-1">{preorder.normalizedDeliveryAddress || preorder.address}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Phone</div>
                    <div className="mt-1">{preorder.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] opacity-60">Email</div>
                    <div className="mt-1">{preorder.email || "-"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-base-200 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="form-control">
                <div className="label py-0">
                  <span className="label-text">Delivered at</span>
                </div>
                <input
                  type="datetime-local"
                  className="input input-bordered"
                  defaultValue={toDateTimeLocal(preorder.deliveredAt || new Date())}
                  id={`delivered-at-${preorder.id}`}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={
                  savingId === preorder.id ||
                  deletingId === preorder.id ||
                  (preorder.status !== "confirmed" && preorder.status !== "fulfilled")
                }
                onClick={() => {
                  const element = document.getElementById(`delivered-at-${preorder.id}`);
                  markDelivered(preorder.id, element?.value);
                }}
              >
                {savingId === preorder.id ? "Saving..." : "Mark as delivered"}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
