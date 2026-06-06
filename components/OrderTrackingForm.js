"use client";

import { useMemo, useState } from "react";

const formatDate = (value = "") => {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: value.includes("T") ? "short" : undefined,
    }).format(new Date(value));
  } catch (_error) {
    return "";
  }
};

const stageClassName = (state = "") => {
  if (state === "complete") {
    return "border-[#6f9a74] bg-[#eef7ef] text-[#264f35]";
  }

  if (state === "current") {
    return "border-[#c97754] bg-[#fff4ed] text-[#7a3f28]";
  }

  return "border-[#ddcfb6] bg-[#fffdf8] text-[#5f7068]";
};

export default function OrderTrackingForm() {
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [trackedOrder, setTrackedOrder] = useState(null);

  const itemSummary = useMemo(() => {
    if (!trackedOrder?.items?.length) {
      return "";
    }

    return trackedOrder.items
      .map((item) => `${item.productName} x ${item.quantity}`)
      .join(", ");
  }, [trackedOrder]);

  const lookupOrder = async (event) => {
    event.preventDefault();
    setError("");
    setTrackedOrder(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/order-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, contact }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not find that order.");
      }

      setTrackedOrder(data.order || null);
    } catch (lookupError) {
      setError(lookupError.message || "Could not find that order.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
      <form
        onSubmit={lookupOrder}
        className="rounded-lg border border-[#ddcfb6] bg-[#fffdf8] p-5 shadow-sm"
      >
        <div>
          <h2 className="text-2xl font-black text-[#213a2f]">Track an order</h2>
          <p className="mt-2 text-sm leading-7 text-[#51685d]">
            Enter your order number and the phone or email used at checkout.
          </p>
        </div>

        <label className="form-control mt-5">
          <div className="label">
            <span className="label-text text-[#365244]">Order number</span>
          </div>
          <input
            className="input input-bordered bg-[#fffdf8]"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="GGH-..."
            autoComplete="off"
            required
          />
        </label>

        <label className="form-control mt-4">
          <div className="label">
            <span className="label-text text-[#365244]">Phone or email</span>
          </div>
          <input
            className="input input-bordered bg-[#fffdf8]"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="hello@example.com or +91..."
            autoComplete="email"
            required
          />
        </label>

        <button type="submit" className="btn btn-primary mt-5 w-full" disabled={isLoading}>
          {isLoading ? "Looking up..." : "Show order status"}
        </button>

        {error && (
          <div className="alert alert-error mt-5">
            <span>{error}</span>
          </div>
        )}

        <p className="mt-5 text-xs leading-6 text-[#6b7d74]">
          We only show order details when the order number and contact detail match.
        </p>
      </form>

      <section className="rounded-lg border border-[#ddcfb6] bg-[#f8f4ea] p-5">
        {trackedOrder ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8b5d39]">
                  {trackedOrder.recordLabel}
                </p>
                <h2 className="mt-2 text-3xl font-black text-[#213a2f]">
                  {trackedOrder.orderNumber}
                </h2>
                {trackedOrder.customerName && (
                  <p className="mt-2 text-sm text-[#51685d]">
                    For {trackedOrder.customerName}
                  </p>
                )}
              </div>
              {trackedOrder.currentStage && (
                <div className={`rounded-full border px-4 py-2 text-sm font-bold ${stageClassName(trackedOrder.currentStage.state)}`}>
                  {trackedOrder.currentStage.label}
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-3">
              {(trackedOrder.timeline || []).map((stage) => (
                <div
                  key={stage.key}
                  className={`rounded-lg border p-4 ${stageClassName(stage.state)}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-black">{stage.label}</h3>
                    {stage.date && <span className="text-xs font-semibold">{formatDate(stage.date)}</span>}
                  </div>
                  <p className="mt-2 text-sm leading-6 opacity-85">{stage.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 rounded-lg border border-[#ddcfb6] bg-[#fffdf8] p-4 text-sm text-[#40584c]">
              {trackedOrder.deliveryDate && (
                <div className="flex justify-between gap-4">
                  <span>Delivery date</span>
                  <strong className="text-right">{formatDate(trackedOrder.deliveryDate)}</strong>
                </div>
              )}
              {trackedOrder.estimatedArrivalAt && (
                <div className="flex justify-between gap-4">
                  <span>Estimated arrival</span>
                  <strong className="text-right">{formatDate(trackedOrder.estimatedArrivalAt)}</strong>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span>Items</span>
                <strong className="text-right">{itemSummary || `${trackedOrder.totalQuantity} item(s)`}</strong>
              </div>
              <div className="flex justify-between gap-4">
                <span>Total</span>
                <strong className="text-right">
                  {trackedOrder.currency} {Number(trackedOrder.total || 0).toFixed(2)}
                </strong>
              </div>
              {trackedOrder.trackingLink && (
                <a
                  className="btn btn-sm btn-primary"
                  href={trackedOrder.trackingLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open tracking link
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col justify-center rounded-lg border border-dashed border-[#d1c4b0] bg-[#fffdf8] p-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8b5d39]">
              Private lookup
            </p>
            <h2 className="mt-3 text-3xl font-black text-[#213a2f]">
              Your order timeline will appear here.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#51685d]">
              We will show the current stage, delivery date, items, and any dispatch details we have.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
