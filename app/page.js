"use client";

import { useMemo, useState } from "react";
import PreorderForm from "@/components/PreorderForm";

const lineup = [
  {
    sku: "GGH-KCK-250",
    name: "Kokum Carrot Kanji",
    note: "Tangy kokum + earthy carrot fermentation with a bold, savory finish.",
    badge: "Kanji",
  },
  {
    sku: "GGH-CUK-250",
    name: "Cucumber Kanji",
    note: "Light, crisp and cooling with a naturally probiotic kick.",
    badge: "Kanji",
  },
  {
    sku: "GGH-PSP-300",
    name: "Pineapple Sparkle",
    note: "Tepache-inspired tropical fizz with gentle fermentation funk.",
    badge: "Sparkle",
  },
  {
    sku: "GGH-MSP-300",
    name: "Melon Sparkle",
    note: "Juicy melon brightness, softly sparkling and ultra-refreshing.",
    badge: "Sparkle",
  },
  {
    sku: "GGH-BUG-330",
    name: "Bug Sodas",
    note: "Experimental small-batch fermented sodas for curious palates.",
    badge: "Lab Batch",
  },
];

const MAX_QTY = 10;
const MIN_PREORDER_QUANTITY = 4;

export default function Page() {
  const [cart, setCart] = useState(() =>
    Object.fromEntries(lineup.map((product) => [product.sku, 0]))
  );

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
        })),
    [cart]
  );

  const resetCart = () => {
    setCart(Object.fromEntries(lineup.map((product) => [product.sku, 0])));
  };

  return (
    <main className="bg-base-200">
      <section className="hero py-12 md:py-16">
        <div className="hero-content w-full max-w-6xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <div className="badge badge-secondary badge-outline">FERMENTED • NON-ALCOHOLIC • SMALL BATCH</div>
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
        <h2 className="text-2xl font-extrabold md:text-3xl">Current lineup</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lineup.map((drink) => {
            const qty = Number(cart[drink.sku] || 0);
            return (
              <article key={drink.name} className="card bg-base-100 shadow-md">
                <div className="card-body">
                  <div className="badge badge-accent badge-outline">{drink.badge}</div>
                  <h3 className="card-title">{drink.name}</h3>
                  <button
                    type="button"
                    className="link link-primary text-left text-xs no-underline hover:underline"
                    onClick={() => updateQty(drink.sku, qty === 0 ? 1 : qty)}
                  >
                    SKU: {drink.sku}
                  </button>
                  <p>{drink.note}</p>
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

      <section id="preorder" className="mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <h2 className="text-2xl font-extrabold md:text-3xl">Preorder now (no login required)</h2>
        <PreorderForm
          selectedItems={selectedItems}
          onOrderPlaced={resetCart}
          updateQty={updateQty}
          minTotalQuantity={MIN_PREORDER_QUANTITY}
        />
      </section>
    </main>
  );
}
