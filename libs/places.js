const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

const PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const BANGALORE_BIAS = {
  circle: {
    center: {
      latitude: 12.9716,
      longitude: 77.5946,
    },
    radius: 30000,
  },
};

const postJson = async (url, body, headers = {}) => {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": mapsApiKey,
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Google Places request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return data;
};

const getJson = async (url, headers = {}) => {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "X-Goog-Api-Key": mapsApiKey,
      ...headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Google Places request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return data;
};

export const isPlacesConfigured = () => Boolean(mapsApiKey);

export const autocompleteAddresses = async ({ input, sessionToken }) => {
  if (!isPlacesConfigured()) {
    throw new Error("Google Maps is not configured. Add GOOGLE_MAPS_API_KEY.");
  }

  if (!input?.trim()) {
    return [];
  }

  const data = await postJson(
    PLACES_AUTOCOMPLETE_URL,
    {
      input,
      includedRegionCodes: ["in"],
      locationBias: BANGALORE_BIAS,
      sessionToken,
    },
    {
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat",
    }
  );

  return (data.suggestions || [])
    .map((suggestion) => suggestion.placePrediction)
    .filter(Boolean)
    .map((prediction) => ({
      placeId: prediction.placeId,
      text: prediction.text?.text || "",
      primaryText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || "",
      secondaryText: prediction.structuredFormat?.secondaryText?.text || "",
    }))
    .filter((prediction) => prediction.placeId && prediction.text);
};

export const getPlaceDetails = async ({ placeId, sessionToken }) => {
  if (!isPlacesConfigured()) {
    throw new Error("Google Maps is not configured. Add GOOGLE_MAPS_API_KEY.");
  }

  if (!placeId) {
    throw new Error("A placeId is required.");
  }

  const query = new URLSearchParams({
    sessionToken: sessionToken || "",
    languageCode: "en",
  });

  const data = await getJson(
    `https://places.googleapis.com/v1/places/${placeId}?${query.toString()}`,
    {
      "X-Goog-FieldMask": "formattedAddress,location,addressComponents,displayName",
    }
  );

  return {
    placeId,
    formattedAddress: data.formattedAddress || data.displayName?.text || "",
    location: data.location || null,
    addressComponents: data.addressComponents || [],
  };
};
