import SubscriptionEditPage from "@/components/SubscriptionEditPage";
import { getSubscriptionSetupContext } from "@/libs/subscription-request";

export default async function SubscriptionEditRoute({ searchParams }) {
  const {
    skuCatalog,
    comboCatalog,
    deliveryWindowId,
    pickupAddress,
    deliveryBands,
    currency,
  } =
    await getSubscriptionSetupContext().catch((error) => {
      console.error(error);
      return {
        skuCatalog: [],
        comboCatalog: [],
        deliveryWindowId: "",
        pickupAddress: "",
        deliveryBands: [],
        currency: "INR",
      };
    });
  const token = searchParams?.token || "";

  return (
    <main className="page-shell landing-page relative isolate overflow-hidden bg-base-200">
      <div
        aria-hidden="true"
        className="page-sparkles pointer-events-none fixed inset-0"
      />
      <section className="relative z-10 mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <div className="mb-6 rounded-[28px] border border-[#d1c4b0] bg-[#f3edde]/90 p-6 text-[#2f4a3e] shadow-lg md:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6b7d74]">
            Manage Your Plan
          </div>
          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">
            Update your box, schedule, or address
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#53675d] md:text-base">
            Use this secure link to make changes to your plan without creating an account.
          </p>
        </div>

        <SubscriptionEditPage
          token={token}
          catalogItems={skuCatalog}
          comboOptions={comboCatalog}
          deliveryWindowId={deliveryWindowId}
          pickupAddress={pickupAddress}
          deliveryBands={deliveryBands}
          currency={currency}
        />
      </section>
    </main>
  );
}
