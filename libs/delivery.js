const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

const BANGALORE_NAMES = ["bengaluru", "bangalore"];

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

const extractAddressNames = (addressComponents = []) => {
  return addressComponents.flatMap((component) => [
    component.long_name?.toLowerCase?.() || component.longText?.toLowerCase?.() || "",
    component.short_name?.toLowerCase?.() || component.shortText?.toLowerCase?.() || "",
  ]);
};

const isBangaloreAddress = (addressComponents = [], formattedAddress = "") => {
  const names = [formattedAddress.toLowerCase(), ...extractAddressNames(addressComponents)];
  return BANGALORE_NAMES.some((cityName) =>
    names.some((value) => value.includes(cityName))
  );
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
    addressComponents: firstResult.address_components || [],
    isInBangalore: isBangaloreAddress(
      firstResult.address_components || [],
      firstResult.formatted_address || ""
    ),
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
    return (
      distanceKm >= Number(band.minDistanceKm || 0) &&
      distanceKm <= Number(band.maxDistanceKm || 0)
    );
  });
};

const resolveDestination = async ({ address, placeDetails }) => {
  if (placeDetails?.formattedAddress) {
    const formattedAddress = address?.trim() || placeDetails.formattedAddress;

    return {
      formattedAddress,
      location: placeDetails.location,
      addressComponents: placeDetails.addressComponents || [],
      isInBangalore: isBangaloreAddress(
        placeDetails.addressComponents || [],
        formattedAddress
      ),
    };
  }

  return geocodeAddress(address);
};

export const calculateDeliveryQuote = async ({
  pickupAddress,
  deliveryBands = [],
  address,
  placeDetails,
  maxDistanceKm = 20,
}) => {
  if (!pickupAddress?.trim() || !deliveryBands.length) {
    return {
      isConfigured: false,
      isDeliverable: true,
      distanceKm: 0,
      deliveryFee: 0,
      normalizedAddress: address,
      matchedBand: null,
      reason: "Delivery is not configured yet.",
      location: null,
    };
  }

  const destination = await resolveDestination({ address, placeDetails });

  if (!destination.isInBangalore) {
    return {
      isConfigured: true,
      isDeliverable: false,
      distanceKm: 0,
      deliveryFee: 0,
      normalizedAddress: destination.formattedAddress,
      matchedBand: null,
      reason: "We do not deliver there yet.",
      location: destination.location,
    };
  }

  const distanceKm = await getDrivingDistanceKm(
    pickupAddress,
    destination.formattedAddress
  );

  if (distanceKm > maxDistanceKm) {
    return {
      isConfigured: true,
      isDeliverable: false,
      distanceKm,
      deliveryFee: 0,
      normalizedAddress: destination.formattedAddress,
      matchedBand: null,
      reason: "We do not deliver there yet.",
      location: destination.location,
    };
  }

  const matchedBand = findDeliveryBand(deliveryBands, distanceKm);

  if (!matchedBand) {
    return {
      isConfigured: true,
      isDeliverable: false,
      distanceKm,
      deliveryFee: 0,
      normalizedAddress: destination.formattedAddress,
      matchedBand: null,
      reason: "We do not deliver there yet.",
      location: destination.location,
    };
  }

  return {
    isConfigured: true,
    isDeliverable: true,
    distanceKm,
    deliveryFee: Number(matchedBand.fee || 0),
    normalizedAddress: destination.formattedAddress,
    matchedBand,
    reason: "",
    location: destination.location,
  };
};
