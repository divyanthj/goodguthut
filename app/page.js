"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import PreorderForm from "@/components/PreorderForm";

const MAX_QTY = 10;
const DEFAULT_MIN_PREORDER_QUANTITY = 4;

const buildFallbackWindow = () => ({
  id: "",
  title: "Preorders currently closed",
  status: "closed",
  currency: "INR",
  minimumOrderQuantity: DEFAULT_MIN_PREORDER_QUANTITY,
  pickupAddress: "",
  deliveryBands: [],
  allowedItems: [],
});

const buildCartFromItems = (items = []) =>
  Object.fromEntries(items.map((item) => [item.sku, 0]));

const normalizeLineupItems = (items = []) =>
  items
    .filter((item) => item?.sku && item.status !== "archived")
    .map((item) => ({
      sku: item.sku,
      name: item.name,
      note: item.notes || "",
      unitPrice: Number(item.unitPrice || 0),
    }));

const formatDeliveryDate = (value) => {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function Page() {
  const [preorderWindow, setPreorderWindow] = useState(buildFallbackWindow);
  const [skuCatalog, setSkuCatalog] = useState([]);
  const [cart, setCart] = useState(() => buildCartFromItems(buildFallbackWindow().allowedItems));
  const [isLoadingWindow, setIsLoadingWindow] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadWindow = async ({ showLoading = true } = {}) => {
      if (isMounted) {
        setIsLoadingWindow(showLoading);
      }

      try {
        const response = await fetch("/api/preorder/window", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!isMounted) {
          return;
        }

        const nextWindow = data?.preorderWindow || buildFallbackWindow();
        const nextSkuCatalog = data?.skuCatalog || [];
        setPreorderWindow(nextWindow);
        setSkuCatalog(nextSkuCatalog);
        setCart((currentCart) => {
          const nextCart = {};
          const sourceItems =
            nextWindow?.status === "open" && nextWindow.allowedItems?.length
              ? nextWindow.allowedItems
              : nextSkuCatalog;

          sourceItems.forEach((item) => {
            nextCart[item.sku] = Number(currentCart[item.sku] || 0);
          });

          return nextCart;
        });
      } catch (_error) {
        if (isMounted) {
          const fallbackWindow = buildFallbackWindow();
          setPreorderWindow(fallbackWindow);
          setSkuCatalog([]);
          setCart(buildCartFromItems(fallbackWindow.allowedItems));
        }
      } finally {
        if (isMounted) {
          setIsLoadingWindow(false);
        }
      }
    };

    const refreshWindow = () => {
      loadWindow({ showLoading: false });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshWindow();
      }
    };

    loadWindow();
    const intervalId = window.setInterval(refreshWindow, 30000);
    window.addEventListener("focus", refreshWindow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWindow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const lineup = useMemo(() => {
    if (preorderWindow?.status === "open" && preorderWindow.allowedItems?.length) {
      return normalizeLineupItems(preorderWindow.allowedItems);
    }

    return normalizeLineupItems(skuCatalog);
  }, [preorderWindow, skuCatalog]);

  const isPreorderOpen = preorderWindow?.status === "open";

  const updateQty = (sku, nextQty) => {
    if (!isPreorderOpen) {
      return;
    }

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
    <main className="page-shell landing-page relative isolate overflow-hidden bg-base-200">
      <div
        aria-hidden="true"
        className="page-sparkles pointer-events-none fixed inset-0"
      />
      <section className="hero relative min-h-screen py-12 md:py-16">
        <div
          className="hero-content relative z-10 w-full max-w-6xl"
        >
          <div className="card w-full rounded-lg border border-[#d1c4b0] bg-[#f3edde]/90 text-[#2f4a3e] shadow-lg backdrop-blur-[2px]">
            <div className="card-body items-start gap-6">
              <div className="badge border border-[#c6b79f] bg-[#f7f1e6] px-3 text-[#2f5d49] shadow-sm">
                FERMENTED | SMALL BATCH
              </div>
              <div className="w-full px-2 py-2 md:px-4 md:py-4">
                <Image
                  src="/images/ggh2.png"
                  alt="The Good Gut Hut"
                  priority
                  width={1844222}
                  height={1844222}
                  className="mx-auto h-auto w-full max-w-4xl"
                />
              </div>
              <p className="max-w-2xl text-lg leading-relaxed text-[#365244] md:text-xl">
                Slowly brewed. Made with care. Gut-friendly fermented drinks crafted for everyday sipping.
              </p>
              <div className="card-actions">
                <a className="btn btn-primary" href="#lineup">
                  Explore the lineup
                </a>
                {isPreorderOpen && (
                  <a className="btn border-[#365244] bg-[#f7f1e6]/80 text-[#365244] hover:border-[#2f5d49] hover:bg-[#ece2cf]" href="#preorder">
                    Place a preorder
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="lineup" className="relative z-10 mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold text-[#2f4a3e] md:text-3xl">Current lineup</h2>
          <div className="badge border border-[#c6b79f] bg-[#f7f1e6]/90 text-[#2f5d49]">
            {preorderWindow.currency || "INR"} pricing
          </div>
        </div>
        {isLoadingWindow && (
          <div className="mt-4 rounded-lg bg-[#f7f1e6]/70 p-5 shadow-md">
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-28 rounded bg-[#ded1bf]" />
              <div className="h-5 w-56 rounded bg-[#e7ddcf]" />
              <div className="h-4 w-72 max-w-full rounded bg-[#e7ddcf]" />
            </div>
          </div>
        )}
        {!isLoadingWindow && !isPreorderOpen && (
          <div className="mt-4 rounded-lg bg-[#f7f1e6]/92 p-4 text-sm text-[#3f5348] shadow-md">
            There are no preorders open right now. The lineup is below, and we&apos;ll announce the next batch soon, so keep a lookout.
          </div>
        )}
        {!isLoadingWindow && isPreorderOpen && preorderWindow.deliveryDate && (
          <div className="mt-4 rounded-lg border border-[#d1c4b0] bg-[#f7f1e6]/92 p-5 text-[#2f4a3e] shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5f7068]">
                  Current batch
                </div>
                <div className="mt-1 text-lg font-semibold">
                  Delivery date: {formatDeliveryDate(preorderWindow.deliveryDate)}
                </div>
                <div className="mt-1 text-sm text-[#5f7068]">
                  Add your SKUs for this batch and we&apos;ll prepare them for this delivery run.
                </div>
              </div>
              {preorderWindow.title && (
                <div className="badge h-auto border border-[#c6b79f] bg-[#fff8ec] px-4 py-3 text-center text-[#2f5d49]">
                  {preorderWindow.title}
                </div>
              )}
            </div>
          </div>
        )}
        {!isLoadingWindow && isPreorderOpen && lineup.length === 0 && (
          <div className="mt-4 rounded-lg bg-[#f7f1e6]/92 p-4 text-sm text-[#3f5348] shadow-md">
            This batch is open, but no sellable catalog SKUs are included yet.
          </div>
        )}
        {isLoadingWindow ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`lineup-skeleton-${index}`}
                className="rounded-lg border border-[#d8cdbb] bg-[#fbf7f0]/75 p-6 shadow-md"
              >
                <div className="animate-pulse space-y-4">
                  <div className="h-5 w-32 rounded bg-[#ded1bf]" />
                  <div className="h-4 w-full rounded bg-[#e7ddcf]" />
                  <div className="h-4 w-4/5 rounded bg-[#e7ddcf]" />
                  <div className="h-4 w-20 rounded bg-[#ded1bf]" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lineup.map((drink) => {
              const qty = Number(cart[drink.sku] || 0);
              return (
                <article key={drink.sku} className="card rounded-lg border border-[#d8cdbb] bg-[#fbf7f0]/94 text-[#2f4a3e] shadow-md">
                  <div className="card-body">
                    <h3 className="card-title">{drink.name}</h3>
                    <p>{drink.note}</p>
                    <div className="text-sm font-medium text-[#5f7068]">
                      {drink.unitPrice > 0
                        ? `${preorderWindow.currency || "INR"} ${drink.unitPrice.toFixed(2)}`
                        : "Price available after admin setup"}
                    </div>
                    <div className="card-actions justify-end">
                      {isPreorderOpen ? (
                        qty === 0 ? (
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
                        )
                      ) : (
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-[#6f7d74]">
                          Preorders closed
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {!isLoadingWindow && preorderWindow.pickupAddress && preorderWindow.deliveryBands?.length > 0 && (
        <section className="relative z-10 mx-auto max-w-6xl px-4 pb-4 md:px-6">
          <div className="rounded-lg border border-[#d8cdbb] bg-[#fbf7f0]/94 p-6 text-[#2f4a3e] shadow-md">
            <h2 className="text-xl font-bold">Delivery charges</h2>
            <p className="mt-2 text-sm text-[#5f7068]">
              Delivery is calculated from the pickup address using Google Maps driving distance.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {preorderWindow.deliveryBands.map((band, index) => (
                <div key={`band-${index}`} className="rounded-md bg-[#efe6d8] px-4 py-3 text-sm text-[#3f5348]">
                  {Number(band.minDistanceKm).toFixed(0)} to {Number(band.maxDistanceKm).toFixed(0)} km: {preorderWindow.currency || "INR"} {Number(band.fee || 0).toFixed(2)}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {!isLoadingWindow && isPreorderOpen && (
        <section id="preorder" className="relative z-10 mx-auto max-w-6xl px-4 pb-12 md:px-6">
          <h2 className="text-2xl font-extrabold text-[#2f4a3e] md:text-3xl">
            Preorder now (no login required)
          </h2>
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
      )}
    </main>
  );
}
