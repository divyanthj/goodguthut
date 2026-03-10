const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

const fetchJson = async (url) => {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Maps request failed with status ${response.status}.`);
  }

  return response.json();
};

export const isGoogleMapsConfigured = () => Boolean(mapsApiKey);

export const geocodeAddress = async (address) => {
  if (!isGoogleMapsConfigured()) {
    throw new Error("Google Maps is not configured. Add GOOGLE_MAPS_API_KEY.");
  }

  const query = new URLSearchParams({
    address,
    key: mapsApiKey,
  });

  const data = await fetchJson(
    `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`
  );

  if (data.status !== "OK" || !data.results?.length) {
    throw new Error("Could not find that delivery address on Google Maps.");
  }

  const firstResult = data.results[0];

  return {
    formattedAddress: firstResult.formatted_address,
    location: firstResult.geometry.location,
  };
};

export const getDrivingDistanceKm = async (originAddress, destinationAddress) => {
  if (!isGoogleMapsConfigured()) {
    throw new Error("Google Maps is not configured. Add GOOGLE_MAPS_API_KEY.");
  }

  const query = new URLSearchParams({
    origins: originAddress,
    destinations: destinationAddress,
    mode: "driving",
    key: mapsApiKey,
  });

  const data = await fetchJson(
    `https://maps.googleapis.com/maps/api/distancematrix/json?${query.toString()}`
  );

  const element = data.rows?.[0]?.elements?.[0];

  if (data.status !== "OK" || !element || element.status !== "OK") {
    throw new Error("Could not calculate delivery distance for this address.");
  }

  return element.distance.value / 1000;
};

export const findDeliveryBand = (deliveryBands = [], distanceKm) => {
  return deliveryBands.find((band) => {
    return distanceKm >= Number(band.minDistanceKm || 0) && distanceKm <= Number(band.maxDistanceKm || 0);
  });
};

export const calculateDeliveryQuote = async ({ pickupAddress, deliveryBands = [], address }) => {
  if (!pickupAddress?.trim() || !deliveryBands.length) {
    return {
      isConfigured: false,
      distanceKm: 0,
      deliveryFee: 0,
      normalizedAddress: address,
      matchedBand: null,
    };
  }

  const geocodedAddress = await geocodeAddress(address);
  const distanceKm = await getDrivingDistanceKm(
    pickupAddress,
    geocodedAddress.formattedAddress
  );
  const matchedBand = findDeliveryBand(deliveryBands, distanceKm);

  if (!matchedBand) {
    throw new Error("This address is outside the configured delivery range.");
  }

  return {
    isConfigured: true,
    distanceKm,
    deliveryFee: Number(matchedBand.fee || 0),
    normalizedAddress: geocodedAddress.formattedAddress,
    matchedBand,
  };
};
