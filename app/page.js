import Image from "next/image";
import UnifiedOrderCheckout from "@/components/UnifiedOrderCheckout";
import { getSubscriptionSetupContext } from "@/libs/subscription-request";

export default async function HomePage() {
  const {
    skuCatalog,
    comboCatalog,
    deliveryWindowId,
    pickupAddress,
    deliveryBands,
    deliveryDaysOfWeek,
    minimumLeadDays,
    recurringMinTotalQuantity,
    freeDeliveryThreshold,
    availableStartDates,
    defaultStartDate,
    currency,
  } = await getSubscriptionSetupContext().catch((error) => {
    console.error(error);
    return {
      skuCatalog: [],
      comboCatalog: [],
      deliveryWindowId: "",
      pickupAddress: "",
      deliveryBands: [],
      deliveryDaysOfWeek: [],
      minimumLeadDays: 3,
      recurringMinTotalQuantity: 6,
      freeDeliveryThreshold: null,
      availableStartDates: [],
      defaultStartDate: "",
      currency: "INR",
    };
  });

  return (
    <main className="page-shell landing-page relative isolate overflow-hidden bg-base-200">
      <div aria-hidden="true" className="page-sparkles pointer-events-none fixed inset-0" />

      <section className="hero relative min-h-screen py-12 md:py-16">
        <div className="hero-content relative z-10 w-full max-w-6xl">
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
                <a className="btn btn-primary" href="#order-flow">
                  Order now
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="order-flow" className="relative z-10 mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <UnifiedOrderCheckout
          catalogItems={skuCatalog}
          comboOptions={comboCatalog}
          deliveryWindowId={deliveryWindowId}
          pickupAddress={pickupAddress}
          deliveryBands={deliveryBands}
          deliveryDaysOfWeek={deliveryDaysOfWeek}
          minimumLeadDays={minimumLeadDays}
          recurringMinTotalQuantity={recurringMinTotalQuantity}
          freeDeliveryThreshold={freeDeliveryThreshold}
          availableStartDates={availableStartDates}
          defaultStartDate={defaultStartDate}
          currency={currency}
        />
      </section>
    </main>
  );
}
