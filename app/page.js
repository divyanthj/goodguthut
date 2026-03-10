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
          {lineup.map((drink) => (
            <article key={drink.name} className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="badge badge-accent badge-outline">{drink.badge}</div>
                <h3 className="card-title">{drink.name}</h3>
                <p className="text-xs opacity-70">SKU: {drink.sku}</p>
                <p>{drink.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="preorder" className="mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <h2 className="text-2xl font-extrabold md:text-3xl">Preorder now (no login required)</h2>
        <p className="mt-2 max-w-3xl opacity-80">
          Customers can place preorders directly with contact + delivery details. User authentication is not required.
        </p>
        <PreorderForm products={lineup} />
      </section>

      <section id="marketplace-ready" className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
        <div className="card bg-secondary/20 shadow-md">
          <div className="card-body">
            <h2 className="card-title text-2xl md:text-3xl">Built with room for preorders + LemonSqueezy</h2>
            <p className="max-w-3xl opacity-80">
              Today this is a focused landing page with open preorder capture. It is intentionally designed to expand
              into a full preorder/ordering marketplace with LemonSqueezy payments later.
            </p>

            <ul className="grid gap-3 md:grid-cols-2">
              {roadmap.map((item) => (
                <li key={item} className="alert bg-base-100 text-base-content">
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
