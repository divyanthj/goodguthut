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
    <form onSubmit={onSubmit} className="mt-6 space-y-5 rounded-3xl border border-[#1E6A4A]/20 bg-white p-6 md:p-8">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold">Name</span>
          <input className="w-full rounded-xl border border-[#1E6A4A]/20 px-4 py-2 outline-none focus:border-[#1E6A4A]" required value={customer.customerName} onChange={(e) => setCustomer((prev) => ({ ...prev, customerName: e.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Email</span>
          <input type="email" className="w-full rounded-xl border border-[#1E6A4A]/20 px-4 py-2 outline-none focus:border-[#1E6A4A]" required value={customer.email} onChange={(e) => setCustomer((prev) => ({ ...prev, email: e.target.value }))} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Phone Number</span>
          <input className="w-full rounded-xl border border-[#1E6A4A]/20 px-4 py-2 outline-none focus:border-[#1E6A4A]" required value={customer.phone} onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold">Address</span>
          <textarea className="w-full rounded-xl border border-[#1E6A4A]/20 px-4 py-2 outline-none focus:border-[#1E6A4A]" rows={3} required value={customer.address} onChange={(e) => setCustomer((prev) => ({ ...prev, address: e.target.value }))} />
        </label>
      </div>

      <div>
        <h3 className="text-lg font-bold">Select quantities by SKU</h3>
        <p className="mt-1 text-sm text-[#1E6A4A]/75">This replaces long 1-10 dropdowns. Each product has a stable SKU + quantity pair so future marketplace integrations stay clean.</p>
        <div className="mt-4 space-y-3">
          {products.map((product) => (
            <div key={product.sku} className="grid gap-3 rounded-2xl border border-[#1E6A4A]/10 p-4 md:grid-cols-[1fr,110px,1fr] md:items-center">
              <div>
                <p className="font-semibold">{product.name}</p>
                <p className="text-xs tracking-[0.15em] text-[#D9898A]">SKU: {product.sku}</p>
              </div>
              <input
                type="number"
                min={0}
                max={99}
                className="rounded-xl border border-[#1E6A4A]/20 px-3 py-2"
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
                className="rounded-xl border border-[#1E6A4A]/20 px-3 py-2"
                value={quantityNotes[product.sku]}
                onChange={(e) =>
                  setQuantityNotes((prev) => ({
                    ...prev,
                    [product.sku]: e.target.value,
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <button type="submit" disabled={isSubmitting} className="rounded-full bg-[#1E6A4A] px-6 py-3 font-semibold text-[#F8F4EA] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
        {isSubmitting ? "Placing preorder..." : "Place preorder"}
      </button>

      {message && <p className="text-sm font-semibold text-[#1E6A4A]">{message}</p>}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </form>
  );
}
