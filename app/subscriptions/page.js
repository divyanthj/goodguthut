import SubscriptionForm from "@/components/SubscriptionForm";
import { getSubscriptionSetupContext } from "@/libs/subscription-request";

export default async function SubscriptionsPage() {
  const { skuCatalog, deliveryWindowId, pickupAddress, deliveryBands, currency } =
    await getSubscriptionSetupContext().catch((error) => {
      console.error(error);
      return {
        skuCatalog: [],
        deliveryWindowId: "",
        pickupAddress: "",
        deliveryBands: [],
        currency: "INR",
      };
    });

  return (
    <main className="page-shell relative isolate overflow-hidden bg-base-200">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_top,_rgba(255,249,236,0.95),_rgba(243,237,222,0.15)_60%)]" />
      </div>

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <div className="rounded-[32px] border border-[#d1c4b0] bg-[#f3edde]/90 p-8 text-[#2f4a3e] shadow-lg backdrop-blur-[2px] md:p-12">
          <div className="badge border border-[#c6b79f] bg-[#f7f1e6] px-3 text-[#2f5d49] shadow-sm">
            SMALL-BATCH SUBSCRIPTIONS
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            Keep your favourites coming, week after week.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#456154] md:text-lg">
            Choose the drinks you love, set your preferred rhythm, and we&apos;ll help you keep a steady stock at home with easy recurring delivery.
          </p>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <SubscriptionForm
          catalogItems={skuCatalog}
          deliveryWindowId={deliveryWindowId}
          pickupAddress={pickupAddress}
          deliveryBands={deliveryBands}
          currency={currency}
        />
      </section>
    </main>
  );
}
