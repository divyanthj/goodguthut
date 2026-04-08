import SubscriptionForm from "@/components/SubscriptionForm";
import { formatDeliveryDaysOfWeek } from "@/libs/subscription-delivery-days";
import { formatMinimumLeadDays } from "@/libs/subscription-settings";
import { getSubscriptionSetupContext } from "@/libs/subscription-request";

export default async function SubscriptionsPage({ searchParams }) {
  const {
    skuCatalog,
    comboCatalog,
    deliveryWindowId,
    pickupAddress,
    deliveryBands,
    deliveryDaysOfWeek,
    minimumLeadDays,
    availableStartDates,
    defaultStartDate,
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
        deliveryDaysOfWeek: [],
        minimumLeadDays: 3,
        availableStartDates: [],
        defaultStartDate: "",
        currency: "INR",
      };
    });
  const initialSelectionMode =
    searchParams?.mode === "custom" ? "custom" : "combo";

  return (
    <main className="page-shell landing-page relative isolate overflow-hidden bg-base-200">
      <div
        aria-hidden="true"
        className="page-sparkles pointer-events-none fixed inset-0"
      />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <div className="rounded-[32px] border border-[#d1c4b0] bg-[#f3edde]/90 p-8 text-[#2f4a3e] shadow-lg backdrop-blur-[2px] md:p-12">
          <div className="badge border border-[#c6b79f] bg-[#f7f1e6] px-3 text-[#2f5d49] shadow-sm">
            SMALL-BATCH SUBSCRIPTIONS
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            Pick a ready-to-go box or create your own delivery plan.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#456154] md:text-lg">
            Choose what you&apos;d like in each delivery, how often you&apos;d like it, and how long you want the plan to run.
          </p>
          <div className="mt-5 inline-flex rounded-full border border-[#d8cdbb] bg-[#fff8ec] px-4 py-2 text-sm text-[#456154]">
            Subscription deliveries go out on {formatDeliveryDaysOfWeek(deliveryDaysOfWeek)} with at least {formatMinimumLeadDays(minimumLeadDays)} notice
          </div>
          <div className="mt-6 grid gap-3 text-sm text-[#456154] md:grid-cols-3">
            <div className="rounded-2xl border border-[#d8cdbb] bg-[#fff8ec] p-4">Easy starter boxes if you want to keep things simple</div>
            <div className="rounded-2xl border border-[#d8cdbb] bg-[#fff8ec] p-4">Build-your-own boxes if you know exactly what you love</div>
            <div className="rounded-2xl border border-[#d8cdbb] bg-[#fff8ec] p-4">Your recurring payments stop automatically when your plan ends</div>
          </div>
        </div>
      </section>

      <section
        id="subscription-flow"
        className="relative z-10 mx-auto max-w-6xl px-4 pb-12 md:px-6"
      >
        <SubscriptionForm
          catalogItems={skuCatalog}
          comboOptions={comboCatalog}
          deliveryWindowId={deliveryWindowId}
          pickupAddress={pickupAddress}
          deliveryBands={deliveryBands}
          deliveryDaysOfWeek={deliveryDaysOfWeek}
          minimumLeadDays={minimumLeadDays}
          availableStartDates={availableStartDates}
          defaultStartDate={defaultStartDate}
          currency={currency}
          initialSelectionMode={initialSelectionMode}
        />
      </section>
    </main>
  );
}
