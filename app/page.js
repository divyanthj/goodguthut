"use client";

import { useEffect, useMemo, useState } from "react";
import PreorderForm from "@/components/PreorderForm";
import { preorderCatalog } from "@/libs/preorder-catalog";

const MAX_QTY = 10;
const DEFAULT_MIN_PREORDER_QUANTITY = 4;

const buildFallbackWindow = () => ({
  id: "",
  title: "Current lineup",
  status: "draft",
  currency: "INR",
  minimumOrderQuantity: DEFAULT_MIN_PREORDER_QUANTITY,
  pickupAddress: "",
  deliveryBands: [],
  allowedItems: preorderCatalog.map((product) => ({
    sku: product.sku,
    productName: product.name,
    unitPrice: product.defaultUnitPrice,
    isActive: true,
    maxPerOrder: 10,
    notes: product.note,
  })),
});

const buildCartFromItems = (items = []) =>
  Object.fromEntries(items.map((item) => [item.sku, 0]));

export default function Page() {
  const [preorderWindow, setPreorderWindow] = useState(buildFallbackWindow);
  const [cart, setCart] = useState(() => buildCartFromItems(buildFallbackWindow().allowedItems));

  useEffect(() => {
    let isMounted = true;

    const loadWindow = async () => {
      try {
        const response = await fetch("/api/preorder/window");
        const data = await response.json();

        if (!isMounted || !data?.preorderWindow) {
          return;
        }

        setPreorderWindow(data.preorderWindow);
        setCart((currentCart) => {
          const nextCart = {};

          (data.preorderWindow.allowedItems || []).forEach((item) => {
            nextCart[item.sku] = Number(currentCart[item.sku] || 0);
          });

          return nextCart;
        });
      } catch (_error) {
        if (isMounted) {
          const fallbackWindow = buildFallbackWindow();
          setPreorderWindow(fallbackWindow);
          setCart(buildCartFromItems(fallbackWindow.allowedItems));
        }
      }
    };

    loadWindow();

    return () => {
      isMounted = false;
    };
  }, []);

  const lineup = useMemo(() => {
    const allowedItems = preorderWindow?.allowedItems?.length
      ? preorderWindow.allowedItems.filter((item) => item.isActive)
      : buildFallbackWindow().allowedItems;

    const catalogMap = new Map(preorderCatalog.map((product) => [product.sku, product]));

    return allowedItems.map((item) => {
      const catalogItem = catalogMap.get(item.sku);

      return {
        sku: item.sku,
        name: item.productName,
        note: item.notes || catalogItem?.note || "",
        unitPrice: Number(item.unitPrice || 0),
      };
    });
  }, [preorderWindow]);

  const updateQty = (sku, nextQty) => {
    const boundedQty = Math.max(0, Math.min(MAX_QTY, nextQty));
    setCart((prev) => ({ ...prev, [sku]: boundedQty }));
  };

  const selectedItems = useMemo(
    () =>
      lineup
        .filter((product) => Number(cart[product.sku] || 0) > 0)
        .map((product) => ({
          sku: product.sku,
          productName: product.name,
          quantity: Number(cart[product.sku] || 0),
          unitPrice: product.unitPrice,
        })),
    [cart, lineup]
  );

  const resetCart = () => {
    setCart(buildCartFromItems(lineup));
  };

  const minTotalQuantity = Number(
    preorderWindow?.minimumOrderQuantity || DEFAULT_MIN_PREORDER_QUANTITY
  );

  return (
    <main className="bg-base-200">
      <section className="hero py-12 md:py-16">
        <div className="hero-content w-full max-w-6xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <div className="badge badge-secondary badge-outline">FERMENTED | NON-ALCOHOLIC | SMALL BATCH</div>
              <h1 className="text-5xl font-black md:text-7xl">
                GGH <span className="block text-2xl font-semibold md:text-4xl">THE GOOD GUT HUT</span>
              </h1>
              <p className="max-w-2xl text-lg md:text-xl">
                Slowly brewed. Made with care. Gut-friendly fermented drinks crafted for everyday sipping.
              </p>
              <div className="card-actions">
                <a className="btn btn-primary" href="#lineup">
                  Explore the lineup
                </a>
                <a className="btn btn-outline" href="#preorder">
                  Place a preorder
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="lineup" className="mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold md:text-3xl">Current lineup</h2>
          <div className="badge badge-outline">{preorderWindow.currency || "INR"} pricing</div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lineup.map((drink) => {
            const qty = Number(cart[drink.sku] || 0);
            return (
              <article key={drink.sku} className="card bg-base-100 shadow-md">
                <div className="card-body">
                  <h3 className="card-title">{drink.name}</h3>
                  <button
                    type="button"
                    className="link link-primary text-left text-xs no-underline hover:underline"
                    onClick={() => updateQty(drink.sku, qty === 0 ? 1 : qty)}
                  >
                    SKU: {drink.sku}
                  </button>
                  <p>{drink.note}</p>
                  <div className="text-sm font-medium opacity-80">
                    {drink.unitPrice > 0
                      ? `${preorderWindow.currency || "INR"} ${drink.unitPrice.toFixed(2)}`
                      : "Price available after admin setup"}
                  </div>
                  <div className="card-actions justify-end">
                    {qty === 0 ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => updateQty(drink.sku, 1)}
                      >
                        Add to cart
                      </button>
                    ) : (
                      <div className="join">
                        <button
                          type="button"
                          className="btn btn-sm join-item"
                          onClick={() => updateQty(drink.sku, qty - 1)}
                        >
                          -
                        </button>
                        <button type="button" className="btn btn-sm join-item" disabled>
                          {qty}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm join-item"
                          onClick={() => updateQty(drink.sku, qty + 1)}
                          disabled={qty >= MAX_QTY}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {preorderWindow.pickupAddress && preorderWindow.deliveryBands?.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-4 md:px-6">
          <div className="rounded-2xl bg-base-100 p-6 shadow-md">
            <h2 className="text-xl font-bold">Delivery charges</h2>
            <p className="mt-2 text-sm opacity-75">
              Delivery is calculated from the pickup address using Google Maps driving distance.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {preorderWindow.deliveryBands.map((band, index) => (
                <div key={`band-${index}`} className="rounded-xl bg-base-200 px-4 py-3 text-sm">
                  {Number(band.minDistanceKm).toFixed(0)} to {Number(band.maxDistanceKm).toFixed(0)} km: {preorderWindow.currency || "INR"} {Number(band.fee || 0).toFixed(2)}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="preorder" className="mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <h2 className="text-2xl font-extrabold md:text-3xl">Preorder now (no login required)</h2>
        <PreorderForm
          selectedItems={selectedItems}
          preorderWindowId={preorderWindow.id || ""}
          currency={preorderWindow.currency || "INR"}
          deliveryBands={preorderWindow.deliveryBands || []}
          pickupAddress={preorderWindow.pickupAddress || ""}
          onOrderPlaced={resetCart}
          updateQty={updateQty}
          minTotalQuantity={minTotalQuantity}
        />
      </section>
    </main>
  );
}

