"use client";

import { useState } from "react";

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

const toDateTimeLocal = (value) => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function AdminPreordersList({ initialPreorders }) {
  const [preorders, setPreorders] = useState(initialPreorders);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

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

      {preorders.map((preorder) => (
        <article key={preorder.id} className="rounded-2xl bg-base-100 p-6 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{preorder.customerName}</h2>
              <p className="text-sm opacity-75">{preorder.email || preorder.phone}</p>
              <p className="mt-1 text-sm opacity-60">Placed {formatDate(preorder.createdAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="badge badge-outline">{preorder.status}</div>
              <div className="badge badge-outline">payment: {preorder.payment?.status || "-"}</div>
              <div className="badge badge-outline">qty {preorder.totalQuantity}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="font-medium">Address</div>
              <div className="mt-2 opacity-80">{preorder.normalizedDeliveryAddress || preorder.address}</div>
            </div>
            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="font-medium">Charges</div>
              <div className="mt-2 opacity-80">Subtotal: {formatCurrency(preorder.currency, preorder.subtotal)}</div>
              <div className="opacity-80">Delivery: {formatCurrency(preorder.currency, preorder.deliveryFee)}</div>
              <div className="opacity-80">Total: {formatCurrency(preorder.currency, preorder.total || preorder.subtotal)}</div>
            </div>
            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="font-medium">Delivery</div>
              <div className="mt-2 opacity-80">Distance: {Number(preorder.deliveryDistanceKm || 0).toFixed(1)} km</div>
              <div className="opacity-80">Delivery date: {formatDate(preorder.deliveryDate)}</div>
              <div className="opacity-80">Delivered at: {formatDate(preorder.deliveredAt)}</div>
            </div>
            <div className="rounded-xl bg-base-200 p-4 text-sm">
              <div className="font-medium">Contact</div>
              <div className="mt-2 opacity-80">Phone: {preorder.phone}</div>
              <div className="opacity-80">Email: {preorder.email || "-"}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-base-200 p-4">
            <div className="font-medium">Items</div>
            <ul className="mt-3 space-y-2 text-sm">
              {preorder.items.map((item) => (
                <li key={`${preorder.id}-${item.sku}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-base-100 px-3 py-2">
                  <span>{item.productName} ({item.sku}) x {item.quantity}</span>
                  <span>{formatCurrency(preorder.currency, item.lineTotal)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-xl bg-base-200 p-4">
            <div className="font-medium">Mark delivered</div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="form-control">
                <div className="label py-0">
                  <span className="label-text">Delivered at</span>
                </div>
                <input
                  type="datetime-local"
                  className="input input-bordered"
                  defaultValue={toDateTimeLocal(preorder.deliveredAt || preorder.deliveryDate || new Date())}
                  id={`delivered-at-${preorder.id}`}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingId === preorder.id}
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
