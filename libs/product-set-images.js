// Six-bottle photos belong to sets; individual SKU photos stay unchanged.
const SIX_BOTTLE_IMAGES = [
  { variant: /beetroot/i, src: "/images/sets/beetroot-six-bottles-isometric.png" },
  { variant: /radish/i, src: "/images/sets/radish-six-bottles-isometric.png" },
  { variant: /kokum/i, src: "/images/sets/kokum-six-bottles-isometric.png" },
];

export const getProductSetImage = (combo) => {
  const items = combo?.items || [];
  if (items.length !== 1 || Number(items[0].quantity) !== 6) return null;
  const productName = items[0].productName || combo.name || "";
  return SIX_BOTTLE_IMAGES.find(({ variant }) => variant.test(productName))?.src || null;
};
