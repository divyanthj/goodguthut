"use client";

import { useMemo, useState } from "react";

const initialCustomer = {
  customerName: "",
  email: "",
  phone: "",
  address: "",
};

export default function PreorderForm({ products }) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(products.map((product) => [product.sku, 0]))
  );
  const [quantityNotes, setQuantityNotes] = useState(() =>
    Object.fromEntries(products.map((product) => [product.sku, ""]))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedItems = useMemo(
    () =>
      products
        .filter((product) => Number(quantities[product.sku] || 0) > 0)
        .map((product) => ({
          sku: product.sku,
          productName: product.name,
          quantity: Number(quantities[product.sku] || 0),
          quantityNotes: quantityNotes[product.sku] || "",
        })),
    [products, quantities, quantityNotes]
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (selectedItems.length === 0) {
      setError("Please add quantity for at least one SKU.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/preorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...customer, items: selectedItems }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not place preorder.");
      }

      setMessage("Preorder received! We will contact you to confirm details.");
      setCustomer(initialCustomer);
      setQuantities(Object.fromEntries(products.map((product) => [product.sku, 0])));
      setQuantityNotes(Object.fromEntries(products.map((product) => [product.sku, ""])));
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
              <span className="label-text">Name</span>
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
              required
              value={customer.email}
              onChange={(e) => setCustomer((prev) => ({ ...prev, email: e.target.value }))}
            />
          </label>
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Phone Number</span>
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
              <span className="label-text">Address</span>
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

        <div>
          <h3 className="text-lg font-bold">Select quantities by SKU</h3>
          <p className="text-sm opacity-80">
            This replaces long 1-10 dropdowns. Each product has a stable SKU + quantity pair so future marketplace
            integrations stay clean.
          </p>
          <div className="mt-4 space-y-3">
            {products.map((product) => (
              <div key={product.sku} className="card card-compact bg-base-200">
                <div className="card-body grid gap-3 md:grid-cols-[1fr,140px,1fr] md:items-center">
                  <div>
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-xs opacity-70">SKU: {product.sku}</p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    className="input input-bordered"
                    value={quantities[product.sku]}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [product.sku]: Number(e.target.value || 0),
                      }))
                    }
                  />
                  <input
                    placeholder="Quantity notes (optional)"
                    className="input input-bordered"
                    value={quantityNotes[product.sku]}
                    onChange={(e) =>
                      setQuantityNotes((prev) => ({
                        ...prev,
                        [product.sku]: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-actions items-center justify-between">
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting ? "Placing preorder..." : "Place preorder"}
          </button>
          {selectedItems.length > 0 && <div className="badge badge-outline">{selectedItems.length} SKU(s) selected</div>}
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
