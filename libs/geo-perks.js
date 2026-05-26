import GeoPerk from "@/models/GeoPerk";

const normalizeText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeTermList = (value = []) => {
  if (Array.isArray(value)) {
    return value.map((term) => String(term || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n|,/)
    .map((term) => term.trim())
    .filter(Boolean);
};

const getComponentText = (component = {}) => [
  component.long_name,
  component.short_name,
  component.longText,
  component.shortText,
  component.name,
].filter(Boolean);

export const normalizeGeoPerkPayload = (body = {}) => {
  const areaLabel = String(body.areaLabel || "").trim();
  const benefits = Array.isArray(body.benefits) && body.benefits.length > 0
    ? body.benefits
    : [{ type: "delivery_fee", mode: "waive" }];

  return {
    name: String(body.name || "").trim(),
    status: body.status === "archived" ? "archived" : "active",
    areaLabel,
    matchTerms: normalizeTermList(body.matchTerms),
    excludeTerms: normalizeTermList(body.excludeTerms),
    benefits: benefits
      .map((benefit) => ({
        type: benefit?.type === "delivery_fee" ? "delivery_fee" : "delivery_fee",
        mode: benefit?.mode === "waive" ? "waive" : "waive",
      }))
      .filter((benefit) => benefit.type === "delivery_fee" && benefit.mode === "waive"),
    customerMessage: String(body.customerMessage || "").trim(),
  };
};

const hasDeliveryFeeWaiver = (geoPerk = {}) =>
  (geoPerk.benefits || []).some(
    (benefit) => benefit?.type === "delivery_fee" && benefit?.mode === "waive"
  );

const buildMatchHaystack = ({ address = "", placeDetails = {}, quote = {} }) => {
  const values = [
    address,
    placeDetails?.formattedAddress,
    placeDetails?.displayName,
    placeDetails?.displayName?.text,
    quote?.normalizedAddress,
  ];

  (placeDetails?.addressComponents || []).forEach((component) => {
    values.push(...getComponentText(component));
  });

  return normalizeText(values.filter(Boolean).join(" "));
};

const getMatchedTerms = ({ terms = [], haystack = "" }) =>
  terms.filter((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm && haystack.includes(normalizedTerm);
  });

export const buildGeoPerkCustomerMessage = (geoPerk = {}) =>
  geoPerk.customerMessage ||
  `Since you are from ${geoPerk.areaLabel || geoPerk.name}, we are waiving your delivery fee.`;

export const findMatchingDeliveryFeePerks = async ({ address = "", placeDetails = {}, quote = {} }) => {
  const haystack = buildMatchHaystack({ address, placeDetails, quote });

  if (!haystack) {
    return [];
  }

  const geoPerks = await GeoPerk.find({ status: "active" }).sort({
    updatedAt: -1,
    createdAt: -1,
  });

  return geoPerks
    .filter(hasDeliveryFeeWaiver)
    .map((geoPerk) => {
      const matchTerms = normalizeTermList(geoPerk.matchTerms);
      const excludeTerms = normalizeTermList(geoPerk.excludeTerms);
      const matchedTerms = getMatchedTerms({ terms: matchTerms, haystack });
      const matchedExcludeTerms = getMatchedTerms({ terms: excludeTerms, haystack });

      if (matchedTerms.length === 0 || matchedExcludeTerms.length > 0) {
        return null;
      }

      return {
        id: geoPerk.id,
        name: geoPerk.name,
        areaLabel: geoPerk.areaLabel,
        type: "delivery_fee",
        mode: "waive",
        customerMessage: buildGeoPerkCustomerMessage(geoPerk),
        matchedTerms,
      };
    })
    .filter(Boolean);
};

export const applyDeliveryFeePerksToQuote = async ({ quote, address = "", placeDetails = {} }) => {
  if (!quote?.isDeliverable) {
    return {
      ...quote,
      deliveryFeeBeforePerks: Number(quote?.deliveryFee || 0),
      appliedPerks: [],
    };
  }

  const appliedPerks = await findMatchingDeliveryFeePerks({
    address,
    placeDetails,
    quote,
  });
  const deliveryFeeBeforePerks = Number(quote.deliveryFee || 0);

  if (appliedPerks.length === 0) {
    return {
      ...quote,
      deliveryFeeBeforePerks,
      appliedPerks: [],
    };
  }

  return {
    ...quote,
    deliveryFeeBeforePerks,
    deliveryFee: 0,
    isFreeDelivery: true,
    appliedPerks,
  };
};
