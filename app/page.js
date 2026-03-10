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

const roadmap = [
  "Product catalog and inventory-ready structure",
  "Preorder flow hooks for upcoming drops",
  "LemonSqueezy checkout integration points",
  "Order status and customer updates",
];

export default function Page() {
  return (
    <main className="min-h-screen bg-[#F8F4EA] text-[#1E6A4A]">
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-16">
        <div className="rounded-[2rem] border border-[#1E6A4A]/15 bg-white/60 p-8 shadow-sm backdrop-blur-sm md:p-12">
          <p className="mb-4 inline-block rounded-full border border-[#D9898A]/40 bg-[#D9898A]/10 px-4 py-1 text-xs font-semibold tracking-[0.2em] text-[#D9898A]">
            FERMENTED • NON-ALCOHOLIC • SMALL BATCH
          </p>

          <h1 className="max-w-3xl text-5xl font-black leading-tight md:text-7xl">
            GGH <span className="block text-2xl font-semibold md:text-4xl">THE GOOD GUT HUT</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#1E6A4A]/85 md:text-xl">
            Slowly brewed. Made with care. Gut-friendly fermented drinks crafted for everyday sipping.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <a
              className="rounded-full bg-[#1E6A4A] px-6 py-3 font-semibold text-[#F8F4EA] transition hover:opacity-90"
              href="#lineup"
            >
              Explore the lineup
            </a>
            <a
              className="rounded-full border border-[#1E6A4A]/30 px-6 py-3 font-semibold text-[#1E6A4A] transition hover:bg-[#1E6A4A]/5"
              href="#preorder"
            >
              Place a preorder
            </a>
          </div>
        </div>
      </section>

      <section id="lineup" className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-2xl font-extrabold md:text-3xl">Current lineup</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lineup.map((drink) => (
            <article
              key={drink.name}
              className="rounded-3xl border border-[#1E6A4A]/10 bg-white p-6 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D9898A]">{drink.badge}</p>
              <h3 className="mt-2 text-xl font-bold">{drink.name}</h3>
              <p className="mt-2 text-xs tracking-[0.15em] text-[#1E6A4A]/70">SKU: {drink.sku}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#1E6A4A]/75">{drink.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="preorder" className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-2xl font-extrabold md:text-3xl">Preorder now (no login required)</h2>
        <p className="mt-2 max-w-3xl text-[#1E6A4A]/80">
          Customers can place preorders directly with contact + delivery details. User authentication is not required.
        </p>
        <PreorderForm products={lineup} />
      </section>

      <section id="marketplace-ready" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-3xl border border-[#D9898A]/30 bg-[#D9898A]/10 p-8 md:p-10">
          <h2 className="text-2xl font-extrabold md:text-3xl">Built with room for preorders + LemonSqueezy</h2>
          <p className="mt-3 max-w-3xl text-[#1E6A4A]/80">
            Today this is a focused landing page with open preorder capture. It is intentionally designed to expand into a full preorder/ordering marketplace with LemonSqueezy payments later.
          </p>

          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {roadmap.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-[#1E6A4A]/10 bg-white/90 px-4 py-3 text-sm font-medium"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
