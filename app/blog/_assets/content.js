import Image from "next/image";
import gghKitchenImg from "@/public/images/ggh2.png";
import gghLogoImg from "@/public/images/logo.jpg";

const categorySlugs = {
  fermentationBasics: "fermentation-basics",
  kanji: "kanji",
  pickles: "pickles",
  gutRituals: "gut-rituals",
};

export const categories = [
  {
    slug: categorySlugs.fermentationBasics,
    title: "Fermentation Basics",
    titleShort: "Basics",
    description:
      "Simple, useful explainers for understanding fermentation, small batches, and live, tangy foods.",
    descriptionShort: "Simple explainers for fermented foods.",
  },
  {
    slug: categorySlugs.kanji,
    title: "Kanji",
    titleShort: "Kanji",
    description:
      "Guides to traditional kanji: what it is, how it tastes, and how to drink it well.",
    descriptionShort: "What kanji is and how to enjoy it.",
  },
  {
    slug: categorySlugs.pickles,
    title: "Pickles",
    titleShort: "Pickles",
    description:
      "Notes on vegetable pickles, spice, patience, lead times, and pairing fermented sides with meals.",
    descriptionShort: "Pickle notes, pairings, and lead times.",
  },
  {
    slug: categorySlugs.gutRituals,
    title: "Gut Rituals",
    titleShort: "Rituals",
    description:
      "Everyday ways to bring fermented drinks and foods into your routine without overthinking it.",
    descriptionShort: "Easy ways to use ferments daily.",
  },
];

const authorSlugs = {
  gghKitchen: "ggh-kitchen",
};

export const authors = [
  {
    slug: authorSlugs.gghKitchen,
    name: "Good Gut Hut Kitchen",
    job: "Small-batch fermentation studio",
    description:
      "Notes from the Good Gut Hut kitchen on kanji, pickles, fermented drinks, and the small-batch choices behind each order.",
    avatar: gghLogoImg,
    socials: [],
  },
];

const styles = {
  h2: "text-2xl lg:text-4xl font-bold tracking-tight mb-4 text-base-content",
  h3: "text-xl lg:text-2xl font-bold tracking-tight mb-2 text-base-content",
  p: "text-base-content/90 leading-relaxed",
  ul: "list-inside list-disc text-base-content/90 leading-relaxed space-y-2",
  li: "list-item",
  note: "rounded-lg border border-base-300 bg-base-200 p-5 text-base-content/90 leading-relaxed",
};

const kitchenImage = {
  src: gghKitchenImg,
  urlRelative: "/images/ggh2.png",
  alt: "Good Gut Hut fermented drinks and kitchen notes",
};

const ArticleImage = ({ alt }) => (
  <Image
    src={gghKitchenImg}
    alt={alt}
    width={700}
    height={500}
    priority={true}
    className="rounded-lg"
    placeholder="blur"
  />
);

export const articles = [
  {
    slug: "what-is-kanji",
    title: "What Is Kanji?",
    description:
      "A simple guide to kanji, the tangy fermented drink, and why its flavor changes from batch to batch.",
    categories: [
      categories.find((category) => category.slug === categorySlugs.kanji),
      categories.find((category) => category.slug === categorySlugs.fermentationBasics),
    ],
    author: authors.find((author) => author.slug === authorSlugs.gghKitchen),
    publishedAt: "2026-06-01",
    image: kitchenImage,
    content: (
      <>
        <ArticleImage alt="Good Gut Hut kanji education note" />
        <section>
          <h2 className={styles.h2}>Kanji is a fermented drink with a point of view</h2>
          <p className={styles.p}>
            Kanji is traditionally made by letting vegetables, spices, water, and time do
            their quiet work. The result is tangy, earthy, lightly sharp, and refreshing in a
            way that feels very different from soda or juice.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>Why it tastes alive</h3>
          <p className={styles.p}>
            Fermentation is not instant flavoring. The drink develops as the batch rests, so
            acidity, spice, color, and aroma can shift gently. That is why kanji can taste
            bright one day and deeper the next.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>How to drink it</h3>
          <ul className={styles.ul}>
            <li className={styles.li}>Start with a small chilled glass before or after a meal.</li>
            <li className={styles.li}>Shake gently if the bottle has natural settling.</li>
            <li className={styles.li}>Keep it refrigerated and enjoy it while the flavor is fresh.</li>
          </ul>
        </section>
        <p className={styles.note}>
          Good Gut Hut makes kanji in small batches, so lead times and flavor notes can vary by
          the batch that is ready that week.
        </p>
      </>
    ),
  },
  {
    slug: "why-fermented-foods-matter",
    title: "Why Fermented Foods Matter",
    description:
      "Fermented foods are not magic; they are patient foods shaped by time, microbes, acid, and care.",
    categories: [
      categories.find((category) => category.slug === categorySlugs.fermentationBasics),
      categories.find((category) => category.slug === categorySlugs.gutRituals),
    ],
    author: authors.find((author) => author.slug === authorSlugs.gghKitchen),
    publishedAt: "2026-05-28",
    image: kitchenImage,
    content: (
      <>
        <ArticleImage alt="Good Gut Hut fermentation basics" />
        <section>
          <h2 className={styles.h2}>Fermentation is preservation plus transformation</h2>
          <p className={styles.p}>
            At its simplest, fermentation is a way of letting helpful microbial activity
            transform food. It can make flavors sharper, textures more interesting, and
            ingredients last differently from fresh produce.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>Why people enjoy it</h3>
          <p className={styles.p}>
            People often come to ferments for the gut-friendly reputation, but stay for the
            flavor. A fermented drink or pickle can add brightness to a meal without needing
            heavy sweetness, artificial fizz, or complicated prep.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>What matters in a good ferment</h3>
          <ul className={styles.ul}>
            <li className={styles.li}>Clean ingredients and careful handling.</li>
            <li className={styles.li}>Enough time for flavor to develop.</li>
            <li className={styles.li}>Batch attention instead of rushing every order into the same timeline.</li>
          </ul>
        </section>
      </>
    ),
  },
  {
    slug: "how-to-drink-fermented-drinks",
    title: "How To Drink Fermented Drinks",
    description:
      "A practical routine for adding kanji or sparkling fermented drinks to your week without making it complicated.",
    categories: [
      categories.find((category) => category.slug === categorySlugs.gutRituals),
      categories.find((category) => category.slug === categorySlugs.kanji),
    ],
    author: authors.find((author) => author.slug === authorSlugs.gghKitchen),
    publishedAt: "2026-05-22",
    image: kitchenImage,
    content: (
      <>
        <ArticleImage alt="Good Gut Hut fermented drink routine" />
        <section>
          <h2 className={styles.h2}>Make it a small ritual</h2>
          <p className={styles.p}>
            Fermented drinks do not need a complicated wellness routine around them. Treat
            them like a small daily ritual: a chilled glass, a good meal, and a flavor you
            actually enjoy.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>Three easy moments</h3>
          <ul className={styles.ul}>
            <li className={styles.li}>Before lunch, when you want something sharp and refreshing.</li>
            <li className={styles.li}>With snacks, instead of a very sweet drink.</li>
            <li className={styles.li}>After a heavy meal, when tangy flavors feel especially welcome.</li>
          </ul>
        </section>
        <section>
          <h3 className={styles.h3}>Storage makes a difference</h3>
          <p className={styles.p}>
            Keep fermented drinks cold unless the bottle instructions say otherwise. Cold
            storage helps the flavor stay steadier and keeps the bottle experience more
            predictable.
          </p>
        </section>
      </>
    ),
  },
  {
    slug: "why-pickles-need-time",
    title: "Why Pickles Need Time",
    description:
      "Pickles take longer because vegetables, spice, salt, and acid need time to become one finished flavor.",
    categories: [
      categories.find((category) => category.slug === categorySlugs.pickles),
      categories.find((category) => category.slug === categorySlugs.fermentationBasics),
    ],
    author: authors.find((author) => author.slug === authorSlugs.gghKitchen),
    publishedAt: "2026-05-16",
    image: kitchenImage,
    content: (
      <>
        <ArticleImage alt="Good Gut Hut pickle lead time note" />
        <section>
          <h2 className={styles.h2}>A pickle is not just chopped vegetables in spice</h2>
          <p className={styles.p}>
            Good pickles need time for the vegetable, seasoning, salt, oil or brine, and
            acidity to settle into one coherent flavor. Rushing that process can leave the
            pickle tasting separate instead of finished.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>Why lead times vary</h3>
          <p className={styles.p}>
            Some vegetables soften quickly. Others hold their bite and need more patience.
            Spice intensity, batch size, and the final texture all affect when a pickle is
            ready to leave the kitchen.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>How to use them</h3>
          <ul className={styles.ul}>
            <li className={styles.li}>Pair sharp pickles with simple rice, dal, curd, or roti.</li>
            <li className={styles.li}>Use a small amount first; fermented flavor travels far.</li>
            <li className={styles.li}>Keep the jar clean and refrigerated if instructed.</li>
          </ul>
        </section>
      </>
    ),
  },
  {
    slug: "how-ggh-makes-small-batches",
    title: "How GGH Makes Small Batches",
    description:
      "A look at the small-batch choices behind Good Gut Hut products, from lead times to customer updates.",
    categories: [
      categories.find((category) => category.slug === categorySlugs.fermentationBasics),
      categories.find((category) => category.slug === categorySlugs.gutRituals),
    ],
    author: authors.find((author) => author.slug === authorSlugs.gghKitchen),
    publishedAt: "2026-05-10",
    image: kitchenImage,
    content: (
      <>
        <ArticleImage alt="Good Gut Hut small batch process" />
        <section>
          <h2 className={styles.h2}>Small batch means the product has a calendar</h2>
          <p className={styles.p}>
            Good Gut Hut products are not treated like shelf inventory that appears instantly.
            Each batch has a making window, a readiness point, and a delivery rhythm.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>What that means for orders</h3>
          <p className={styles.p}>
            Kanji, sparkle, pickles, gifts, and custom packs can have different lead times.
            That is why the website now shows category and product lead-time notes instead of
            pretending every item follows one timeline.
          </p>
        </section>
        <section>
          <h3 className={styles.h3}>Why customer updates matter</h3>
          <p className={styles.p}>
            Small-batch commerce should still feel clear. Order tracking, production updates,
            delivery notes, invoices, and WhatsApp contact all exist so the human process does
            not become confusing for the customer.
          </p>
        </section>
      </>
    ),
  },
];

