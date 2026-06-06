import Image from "next/image";
import UnifiedOrderCheckout from "@/components/UnifiedOrderCheckout";
import { getSubscriptionSetupContext } from "@/libs/subscription-request";
import config from "@/config";

const SUPPORT_PHONE_DISPLAY = "+91 99163 31569";
const SUPPORT_PHONE_WHATSAPP = "919916331569";
const whatsappHref = `https://wa.me/${SUPPORT_PHONE_WHATSAPP}?text=${encodeURIComponent(
  "Hi Good Gut Hut, I would like to know more about your ferments."
)}`;

const productCategories = [
  {
    value: "kanji",
    name: "Kanji",
    eyebrow: "Earthy, sharp, alive",
    description:
      "Traditional fermented kanji for people who like their gut-friendly drinks bold, tangy, and deeply refreshing.",
    notes: ["Great as a daily ritual", "Small-batch brewed", "Lead time varies by batch"],
  },
  {
    value: "sparkle",
    name: "Sparkle",
    eyebrow: "Light fermented fizz",
    description:
      "Bright fermented drinks for easy sipping, built for people who want something more interesting than soda.",
    notes: ["Non-alcoholic", "Easy to gift", "Made for everyday sipping"],
  },
  {
    value: "pickles",
    name: "Pickles",
    eyebrow: "Slow, spiced, patient",
    description:
      "Vegetable-forward ferments customized by spice and ingredient, made with the kind of patience pickles deserve.",
    notes: ["Longer lead times", "Custom spice levels", "Great with meals"],
  },
  {
    value: "gift_packs",
    name: "Gift Packs",
    eyebrow: "A box with a little gut joy",
    description:
      "Curated packs for birthdays, thank-yous, hosts, teams, and anyone who deserves something more personal.",
    notes: ["Thoughtful assortments", "Great for celebrations", "Custom notes possible"],
  },
  {
    value: "subscriptions",
    name: "Subscriptions",
    eyebrow: "Your recurring ferment rhythm",
    description:
      "Weekly recurring plans for people who know they want the fridge stocked without thinking about it every time.",
    notes: ["Weekly cadence", "Free recurring delivery", "Edit link by email"],
  },
  {
    value: "custom_orders",
    name: "Custom Orders",
    eyebrow: "Bulk, events, and experiments",
    description:
      "A dedicated path for bulk orders, custom packs, and the larger-format requests that need a human conversation.",
    notes: ["WhatsApp-first", "Made to brief", "Good for teams and gifting"],
  },
];

const fallbackCategory = {
  value: "other",
  name: "Seasonal Specials",
  eyebrow: "Small surprises",
  description:
    "Limited batch ferments and kitchen experiments that are available only when the timing is right.",
  notes: ["Limited availability", "Small-batch only", "Fresh from the kitchen"],
};

const categoryByValue = new Map(
  [...productCategories, fallbackCategory].map((category) => [category.value, category])
);

const values = [
  {
    title: "Small batch by design",
    copy: "Every batch has a start date, a rhythm, and a human watching it instead of a faceless production line.",
  },
  {
    title: "Fermentation with context",
    copy: "We want people to know what they are drinking, why it tastes the way it does, and how to use it well.",
  },
  {
    title: "Warm commerce",
    copy: "Ordering should feel simple, but never cold. WhatsApp, email, and clear updates stay part of the experience.",
  },
];

const testimonials = [
  {
    quote: "The drinks feel thoughtful, not mass-produced. I like that every order still feels personal.",
    name: "Regular customer",
  },
  {
    quote: "The kanji has become a weekly fridge staple. Tangy, bright, and exactly the kind of thing I want after lunch.",
    name: "Kanji drinker",
  },
  {
    quote: "Gift packs are the thing I want GGH to lean into. It already feels like something made for sharing.",
    name: "GGH friend",
  },
];

const educationTopics = [
  {
    title: "What kanji is and why it tastes alive",
    href: "/blog/what-is-kanji",
  },
  {
    title: "How fermented drinks fit into an everyday routine",
    href: "/blog/how-to-drink-fermented-drinks",
  },
  {
    title: "What makes pickles need a longer lead time",
    href: "/blog/why-pickles-need-time",
  },
];

const getVisibleCatalogItems = (skuCatalog = []) =>
  skuCatalog
    .filter((item) => item?.sku && item.status !== "archived")
    .sort((left, right) => {
      const leftOrder = Number(left.displayOrder || 0);
      const rightOrder = Number(right.displayOrder || 0);

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return String(left.name || "").localeCompare(String(right.name || ""));
    });

const groupCatalogByCategory = (items = []) => {
  const grouped = new Map();

  items.forEach((item) => {
    const category = categoryByValue.has(item.category) ? item.category : "other";
    const current = grouped.get(category) || [];
    current.push(item);
    grouped.set(category, current);
  });

  return [...productCategories, fallbackCategory]
    .map((category) => ({
      ...category,
      items: grouped.get(category.value) || [],
    }))
    .filter((category) => category.value !== "other" || category.items.length > 0);
};

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

  const visibleCatalogItems = getVisibleCatalogItems(skuCatalog);
  const catalogCategoryGroups = groupCatalogByCategory(visibleCatalogItems);

  return (
    <main className="page-shell landing-page relative isolate overflow-hidden bg-base-200 text-[#213a2f]">
      <div aria-hidden="true" className="page-sparkles pointer-events-none fixed inset-0" />

      <section className="relative z-10 overflow-hidden border-b border-[#ddcfb6] bg-[#f7f1e6]">
        <div className="absolute inset-0 opacity-[0.07]">
          <Image
            src="/images/ggh2.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
        <div className="relative mx-auto grid min-h-[86vh] max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#8b5d39]">
              Fermented | Small batch | Made with care
            </p>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] text-[#213a2f] md:text-7xl">
              The Good Gut Hut
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#40584c] md:text-xl">
              Slowly brewed kanji, sparkle, pickles, and gut-friendly packs for people who want their everyday rituals to feel alive.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="btn btn-primary" href="#order-flow">
                Order now
              </a>
              <a className="btn border-[#355a45] bg-[#fffdf8] text-[#355a45] hover:border-[#355a45] hover:bg-[#eef3e8]" href="#products">
                Explore products
              </a>
              <a className="btn border-[#c97754] bg-[#fff4ed] text-[#7a3f28] hover:border-[#c97754] hover:bg-[#ffe9db]" href={whatsappHref} target="_blank" rel="noreferrer">
                WhatsApp us
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm md:max-w-md">
            <div className="aspect-square overflow-hidden rounded-lg border border-[#d1c4b0] bg-[#fffdf8] shadow-xl">
              <Image
                src="/images/logo.jpg"
                alt="Good Gut Hut logo"
                width={900}
                height={900}
                priority
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="products" className="relative z-10 bg-[#fffdf8] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8b5d39]">
                Product showcase
              </p>
              <h2 className="mt-3 text-4xl font-black leading-tight text-[#213a2f] md:text-5xl">
                Find the ferment that fits your day.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-[#51685d]">
              Browse bold kanji, sparkling fermented drinks, slow pickles,
              gift packs, subscriptions, and custom orders in one easy place.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {catalogCategoryGroups.map((category) => (
              <article key={category.name} className="rounded-lg border border-[#ddcfb6] bg-[#f8f4ea] p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#9b6042]">
                  {category.eyebrow}
                </p>
                <h3 className="mt-3 text-2xl font-black text-[#213a2f]">{category.name}</h3>
                <p className="mt-3 min-h-[96px] text-sm leading-6 text-[#51685d]">
                  {category.description}
                </p>
                {category.items.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {category.items.slice(0, 3).map((item) => (
                      <div key={item.sku} className="overflow-hidden rounded-lg border border-[#d8c5a7] bg-[#fffdf8]">
                        <div
                          aria-hidden="true"
                          className="h-28 bg-[#eef3e8] bg-cover bg-center"
                          style={{
                            backgroundImage: `url("${item.imageUrl || "/images/logo.jpg"}")`,
                          }}
                        />
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-black text-[#213a2f]">{item.name}</h4>
                              {item.packLabel && (
                                <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[#9b6042]">
                                  {item.packLabel}
                                </p>
                              )}
                            </div>
                            <span className="rounded-full bg-[#f4d8c8] px-3 py-1 text-xs font-bold text-[#7a3f28]">
                              {currency} {Number(item.unitPrice || 0).toFixed(0)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-[#51685d]">
                            {item.shortDescription || item.notes || "A fresh small-batch ferment from the GGH kitchen."}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Number(item.effectiveLeadTimeDays || item.leadTimeDays || 0) > 0 && (
                              <span className="rounded-full border border-[#d8c5a7] bg-[#f7f1e6] px-3 py-1 text-xs font-semibold text-[#4a5d54]">
                                {Number(item.effectiveLeadTimeDays || item.leadTimeDays || 0)} day lead
                              </span>
                            )}
                      {item.benefits && (
                        <span className="rounded-full border border-[#cad8c5] bg-[#eef3e8] px-3 py-1 text-xs font-semibold text-[#355a45]">
                                Why people love it
                        </span>
                      )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {category.items.length > 3 && (
                      <p className="text-sm font-semibold text-[#51685d]">
                        +{category.items.length - 3} more in checkout
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {category.notes.map((note) => (
                      <span key={note} className="rounded-full border border-[#d8c5a7] bg-[#fffdf8] px-3 py-1 text-xs font-semibold text-[#4a5d54]">
                        {note}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          {visibleCatalogItems.length > 0 && (
            <div className="mt-12 rounded-lg border border-[#cad8c5] bg-[#eef3e8] p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#496d4c]">
                    Current batch
                  </p>
                  <h3 className="mt-2 text-2xl font-black text-[#213a2f]">
                    Available from the live catalog
                  </h3>
                </div>
                <a href="#order-flow" className="btn btn-sm btn-primary">
                  Build your order
                </a>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {visibleCatalogItems.slice(0, 6).map((item) => (
                  <div key={item.sku} className="rounded-lg border border-[#cad8c5] bg-[#fffdf8] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-[#213a2f]">{item.name}</h4>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7d74]">
                          {item.categoryLabel || item.sku}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#f4d8c8] px-3 py-1 text-xs font-bold text-[#7a3f28]">
                        {currency} {Number(item.unitPrice || 0).toFixed(0)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#51685d]">
                      {item.shortDescription || item.notes || "A fresh small-batch ferment from the GGH kitchen."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.packLabel && (
                        <span className="rounded-full border border-[#d8c5a7] bg-[#f7f1e6] px-3 py-1 text-xs font-semibold text-[#4a5d54]">
                          {item.packLabel}
                        </span>
                      )}
                      {Number(item.effectiveLeadTimeDays || item.leadTimeDays || 0) > 0 && (
                        <span className="rounded-full border border-[#cad8c5] bg-[#eef3e8] px-3 py-1 text-xs font-semibold text-[#355a45]">
                          {Number(item.effectiveLeadTimeDays || item.leadTimeDays || 0)} day lead
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="about" className="relative z-10 bg-[#2f4a3e] px-6 py-16 text-[#fffdf8]">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f0c6a8]">
              What we stand for
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
              Made slowly, shared warmly.
            </h2>
            <p className="mt-5 text-base leading-8 text-[#f5eadb]">
              We ferment with patience, explain what is in every bottle or jar,
              and keep the ordering experience personal from browsing to delivery.
            </p>
          </div>
          <div className="grid gap-4">
            {values.map((value) => (
              <article key={value.title} className="rounded-lg border border-[#66806e] bg-[#3c5d4c] p-5">
                <h3 className="text-xl font-black">{value.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#f5eadb]">{value.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="subscriptions" className="relative z-10 bg-[#f8f4ea] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8b5d39]">
              Subscriptions and packs
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-[#213a2f] md:text-5xl">
              Choose a one-time batch, recurring rhythm, or gift-worthy pack.
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-8 text-[#51685d]">
              Order once, set up a weekly rhythm, or ask us to build a gift or
              event pack around the people you are buying for.
            </p>
          </div>
          <div className="rounded-lg border border-[#d1c4b0] bg-[#fffdf8] p-5">
            <h3 className="text-xl font-black text-[#213a2f]">Need something custom?</h3>
            <p className="mt-3 text-sm leading-7 text-[#51685d]">
              For gift packs, larger batches, event orders, or custom pickle requests, start on WhatsApp and we will shape it with you.
            </p>
            <a className="btn btn-primary mt-5 w-full" href={whatsappHref} target="_blank" rel="noreferrer">
              Start a custom request
            </a>
          </div>
        </div>
      </section>

      <section id="testimonials" className="relative z-10 bg-[#fffdf8] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8b5d39]">
            Testimonials
          </p>
          <h2 className="mt-3 text-4xl font-black leading-tight text-[#213a2f] md:text-5xl">
            Loved by people who like their food alive.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <figure key={testimonial.name} className="rounded-lg border border-[#ddcfb6] bg-[#f8f4ea] p-5">
                <blockquote className="text-base leading-7 text-[#40584c]">
                  &quot;{testimonial.quote}&quot;
                </blockquote>
                <figcaption className="mt-5 text-sm font-bold uppercase tracking-[0.18em] text-[#8b5d39]">
                  {testimonial.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section id="learn" className="relative z-10 bg-[#f7f1e6] px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.85fr_1.15fr] md:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8b5d39]">
              Fermentation notes
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-[#213a2f] md:text-5xl">
              Know what you are tasting.
            </h2>
            <p className="mt-5 text-base leading-8 text-[#51685d]">
              Start with the practical notes behind the bottles and jars:
              what kanji is, why pickles need patience, and how fermented
              drinks can fit into a normal week.
            </p>
            <a className="btn mt-6 border-[#213a2f] bg-[#213a2f] text-[#fffdf8] hover:bg-[#2f4a3e]" href="/blog">
              Read fermentation notes
            </a>
          </div>
          <div className="grid gap-3">
            {educationTopics.map((topic) => (
              <a
                key={topic.href}
                className="rounded-lg border border-[#d1c4b0] bg-[#fffdf8] px-5 py-4 text-lg font-bold text-[#213a2f] transition hover:-translate-y-0.5 hover:border-[#8b5d39] hover:shadow-md"
                href={topic.href}
              >
                {topic.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="relative z-10 bg-[#213a2f] px-6 py-16 text-[#fffdf8]">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_1fr] md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f0c6a8]">
              Contact
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
              Questions, custom packs, or order help?
            </h2>
            <p className="mt-5 text-base leading-8 text-[#f5eadb]">
              Message us on WhatsApp or email us for order help, custom packs,
              gifting, subscriptions, or anything you want to understand before ordering.
            </p>
          </div>
          <div className="rounded-lg border border-[#66806e] bg-[#2f4a3e] p-5">
            <div className="grid gap-3">
              <a className="btn bg-[#f4d8c8] text-[#5a2d1d] hover:bg-[#ffd9c3]" href={whatsappHref} target="_blank" rel="noreferrer">
                WhatsApp {SUPPORT_PHONE_DISPLAY}
              </a>
              <a className="btn border-[#fffdf8] bg-transparent text-[#fffdf8] hover:border-[#fffdf8] hover:bg-[#406351]" href="/track-order">
                Track an order
              </a>
              {config.mailgun.supportEmail && (
                <a className="btn border-[#fffdf8] bg-transparent text-[#fffdf8] hover:border-[#fffdf8] hover:bg-[#406351]" href={`mailto:${config.mailgun.supportEmail}`}>
                  Email {config.mailgun.supportEmail}
                </a>
              )}
              <a className="btn btn-primary" href="#order-flow">
                Go to cart
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="order-flow" className="relative z-10 bg-[#f8f4ea] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8b5d39]">
              Order
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-[#213a2f] md:text-5xl">
              Build your Good Gut Hut order.
            </h2>
            <p className="mt-4 text-base leading-8 text-[#51685d]">
              Choose a ready set, customize your bottle mix, or switch into a recurring weekly plan.
            </p>
          </div>
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
        </div>
      </section>
    </main>
  );
}
