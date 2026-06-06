import OrderTrackingForm from "@/components/OrderTrackingForm";

export const metadata = {
  title: "Track your Good Gut Hut order",
  description:
    "Check your Good Gut Hut order status with your order number and checkout phone or email.",
};

export default function TrackOrderPage() {
  return (
    <main className="page-shell min-h-screen bg-base-200 text-[#213a2f]">
      <section className="border-b border-[#ddcfb6] bg-[#f7f1e6] px-4 py-14 md:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8b5d39]">
            Order tracking
          </p>
          <h1 className="mt-3 max-w-3xl text-5xl font-black leading-tight md:text-6xl">
            See where your ferment is.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#51685d]">
            No account required. Use your order number with the phone or email you used at checkout.
          </p>
        </div>
      </section>

      <section className="px-4 py-12 md:px-6">
        <div className="mx-auto max-w-6xl">
          <OrderTrackingForm />
        </div>
      </section>
    </main>
  );
}
