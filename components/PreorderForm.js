"use client";

import { useEffect, useMemo, useState } from "react";

const initialCustomer = {
  customerName: "",
  email: "",
  phone: "",
  address: "",
};

const MAX_QTY = 10;

export default function PreorderForm({
  selectedItems,
  preorderWindowId,
  currency = "INR",
  deliveryBands = [],
  pickupAddress = "",
  onOrderPlaced,
  updateQty,
  minTotalQuantity,
}) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [isQuotingDelivery, setIsQuotingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");

  const totalQuantity = useMemo(
    () => selectedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [selectedItems]
  );

  const subtotal = useMemo(
    () =>
      selectedItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0
      ),
    [selectedItems]
  );

  const total = subtotal + Number(deliveryQuote?.deliveryFee || 0);
  const hasMandatoryFields =
    customer.customerName.trim() && customer.phone.trim() && customer.address.trim();
  const meetsMinQty = totalQuantity >= minTotalQuantity;
  const canSubmit = Boolean(
    hasMandatoryFields && meetsMinQty && selectedItems.length > 0 && !isSubmitting
  );

  useEffect(() => {
    const address = customer.address.trim();

    setDeliveryError("");

    if (!address || !preorderWindowId || !pickupAddress || deliveryBands.length === 0) {
      setDeliveryQuote(null);
      setIsQuotingDelivery(false);
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      setIsQuotingDelivery(true);

      try {
        const response = await fetch("/api/preorder/delivery-quote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            preorderWindowId,
            address,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Could not calculate delivery fee.");
        }

        setDeliveryQuote(data);
        setDeliveryError("");
      } catch (quoteError) {
        setDeliveryQuote(null);
        setDeliveryError(quoteError.message || "Could not calculate delivery fee.");
      } finally {
        setIsQuotingDelivery(false);
      }
    }, 700);

    return () => clearTimeout(timeoutId);
  }, [customer.address, preorderWindowId, pickupAddress, deliveryBands]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (selectedItems.length === 0) {
      setError("Please add at least one item from the lineup before placing a preorder.");
      return;
    }

    if (!hasMandatoryFields) {
      setError("Please fill in name, phone number, and address.");
      return;
    }

    if (!meetsMinQty) {
      setError(`Minimum preorder quantity is ${minTotalQuantity}.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/preorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customer,
          preorderWindowId,
          items: selectedItems,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not place preorder.");
      }

      setMessage(
        data.total > 0
          ? `Preorder received. Total due: ${currency} ${Number(data.total).toFixed(2)} including delivery.`
          : "Preorder received! We will contact you to confirm details."
      );
      setCustomer(initialCustomer);
      setDeliveryQuote(null);
      onOrderPlaced?.();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card mt-6 bg-base-100 shadow-xl">
      <div className="card-body gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Name *</span>
            </div>
            <input
              className="input input-bordered w-full"
              required
              value={customer.customerName}
              onChange={(e) => setCustomer((prev) => ({ ...prev, customerName: e.target.value }))}
            />
          </label>
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Email</span>
            </div>
            <input
              type="email"
              className="input input-bordered w-full"
              value={customer.email}
              onChange={(e) => setCustomer((prev) => ({ ...prev, email: e.target.value }))}
            />
          </label>
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Phone Number *</span>
            </div>
            <input
              className="input input-bordered w-full"
              required
              value={customer.phone}
              onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </label>
          <label className="form-control w-full md:col-span-2">
            <div className="label">
              <span className="label-text">Address *</span>
            </div>
            <textarea
              className="textarea textarea-bordered"
              rows={3}
              required
              value={customer.address}
              onChange={(e) => setCustomer((prev) => ({ ...prev, address: e.target.value }))}
            />
          </label>
        </div>

        <div className="card bg-base-200 card-compact">
          <div className="card-body gap-3">
            <h3 className="card-title text-lg">Your cart</h3>
            {selectedItems.length === 0 ? (
              <p className="text-sm opacity-70">No items selected yet. Add products from the lineup above.</p>
            ) : (
              <ul className="space-y-2">
                {selectedItems.map((item) => (
                  <li key={item.sku} className="flex items-center justify-between rounded-lg bg-base-100 px-3 py-2">
                    <div>
                      <div>{item.productName}</div>
                      <div className="text-xs opacity-60">
                        {currency} {Number(item.unitPrice || 0).toFixed(2)} each
                      </div>
                    </div>
                    <div className="join">
                      <button
                        type="button"
                        className="btn btn-sm join-item"
                        onClick={() => updateQty(item.sku, Number(item.quantity) - 1)}
                      >
                        -
                      </button>
                      <button type="button" className="btn btn-sm join-item" disabled>
                        {item.quantity}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm join-item"
                        onClick={() => updateQty(item.sku, Number(item.quantity) + 1)}
                        disabled={Number(item.quantity) >= MAX_QTY}
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-sm opacity-80">Total quantity: {totalQuantity}</div>
            <div className="text-sm opacity-80">Minimum quantity required: {minTotalQuantity}</div>
            <div className="text-sm font-medium opacity-90">Subtotal: {currency} {subtotal.toFixed(2)}</div>
            <div className="text-sm font-medium opacity-90">
              Delivery: {deliveryQuote ? `${currency} ${Number(deliveryQuote.deliveryFee).toFixed(2)}` : isQuotingDelivery ? "Calculating..." : `${currency} 0.00`}
            </div>
            {deliveryQuote && (
              <div className="text-sm opacity-80">
                Distance: {Number(deliveryQuote.distanceKm).toFixed(1)} km to {deliveryQuote.normalizedAddress}
              </div>
            )}
            {deliveryError && <div className="text-sm text-error">{deliveryError}</div>}
            <div className="text-sm font-semibold">Total: {currency} {total.toFixed(2)}</div>
          </div>
        </div>

        <div className="card-actions items-center justify-between">
          <button type="submit" disabled={!canSubmit} className="btn btn-primary">
            {isSubmitting ? "Placing preorder..." : "Place preorder"}
          </button>
          {selectedItems.length > 0 && <div className="badge badge-outline">{selectedItems.length} item(s) selected</div>}
        </div>

        {message && (
          <div className="alert alert-success">
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
      </div>
    </form>
  );
}
