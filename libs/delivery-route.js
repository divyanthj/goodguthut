import { isGoogleMapsConfigured } from "@/libs/delivery";

const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";
const MAX_DISTANCE_MATRIX_ELEMENTS = 100;

const chunkArray = (items = [], chunkSize = 1) => {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

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

const buildDistanceMatrixBlock = async ({ origins = [], destinations = [] }) => {
  const query = new URLSearchParams({
    origins: origins.join("|"),
    destinations: destinations.join("|"),
    mode: "driving",
    key: mapsApiKey,
  });

  const data = await fetchJson(
    `https://maps.googleapis.com/maps/api/distancematrix/json?${query.toString()}`
  );

  if (data.status !== "OK") {
    throw new Error("Could not calculate route distances for this batch.");
  }

  return (data.rows || []).map((row) =>
    (row.elements || []).map((element) => {
      if (element.status !== "OK") {
        return Number.POSITIVE_INFINITY;
      }

      return Number(element.distance?.value || 0) / 1000;
    })
  );
};

export const getDrivingDistanceMatrixKm = async (addresses = []) => {
  if (!isGoogleMapsConfigured()) {
    throw new Error("Google Maps is not configured. Add GOOGLE_MAPS_API_KEY.");
  }

  const normalizedAddresses = addresses
    .map((address) => String(address || "").trim())
    .filter(Boolean);

  if (normalizedAddresses.length === 0) {
    return [];
  }

  const dimension = normalizedAddresses.length;
  const matrix = Array.from({ length: dimension }, () =>
    Array.from({ length: dimension }, () => Number.POSITIVE_INFINITY)
  );
  const maxChunkSize = Math.max(1, Math.floor(Math.sqrt(MAX_DISTANCE_MATRIX_ELEMENTS)));
  const originChunks = chunkArray(normalizedAddresses, maxChunkSize);
  const destinationChunks = chunkArray(normalizedAddresses, maxChunkSize);

  for (let originChunkIndex = 0; originChunkIndex < originChunks.length; originChunkIndex += 1) {
    for (
      let destinationChunkIndex = 0;
      destinationChunkIndex < destinationChunks.length;
      destinationChunkIndex += 1
    ) {
      const originChunk = originChunks[originChunkIndex];
      const destinationChunk = destinationChunks[destinationChunkIndex];
      const block = await buildDistanceMatrixBlock({
        origins: originChunk,
        destinations: destinationChunk,
      });

      block.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
          const globalRow = originChunkIndex * maxChunkSize + rowIndex;
          const globalColumn = destinationChunkIndex * maxChunkSize + columnIndex;
          matrix[globalRow][globalColumn] = globalRow === globalColumn ? 0 : value;
        });
      });
    }
  }

  return matrix;
};

const calculateRouteDistance = (sequence = [], matrix = []) => {
  let total = 0;

  for (let index = 0; index < sequence.length - 1; index += 1) {
    total += Number(matrix[sequence[index]]?.[sequence[index + 1]] || 0);
  }

  return total;
};

const buildNearestNeighborRoute = (matrix = []) => {
  const remaining = new Set(matrix.map((_, index) => index).filter((index) => index !== 0));
  const route = [0];
  let current = 0;

  while (remaining.size > 0) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate) => {
      const distance = Number(matrix[current]?.[candidate] || Number.POSITIVE_INFINITY);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = candidate;
      }
    });

    if (bestIndex === -1) {
      break;
    }

    route.push(bestIndex);
    remaining.delete(bestIndex);
    current = bestIndex;
  }

  return route;
};

const optimizeRouteWithTwoOpt = (route = [], matrix = []) => {
  if (route.length < 4) {
    return route;
  }

  let bestRoute = [...route];
  let improved = true;

  while (improved) {
    improved = false;

    for (let left = 1; left < bestRoute.length - 2; left += 1) {
      for (let right = left + 1; right < bestRoute.length - 1; right += 1) {
        const candidate = [
          ...bestRoute.slice(0, left),
          ...bestRoute.slice(left, right + 1).reverse(),
          ...bestRoute.slice(right + 1),
        ];

        if (calculateRouteDistance(candidate, matrix) < calculateRouteDistance(bestRoute, matrix)) {
          bestRoute = candidate;
          improved = true;
        }
      }
    }
  }

  return bestRoute;
};

export const buildDeliveryRoutePlan = async ({
  pickupAddress = "",
  preorders = [],
  driverPayoutPerKm = 0,
}) => {
  const originAddress = String(pickupAddress || "").trim();
  const deliveryStops = (Array.isArray(preorders) ? preorders : []).filter(
    (preorder) =>
      preorder?.fulfillmentMethod === "delivery" &&
      (preorder?.normalizedDeliveryAddress || preorder?.address)
  );

  if (!originAddress) {
    throw new Error("Add a verified pickup address before generating a delivery route.");
  }

  if (deliveryStops.length === 0) {
    return {
      originAddress,
      totalStops: 0,
      totalDistanceKm: 0,
      driverPayout: 0,
      payoutPerKm: Number(driverPayoutPerKm || 0),
      stops: [],
    };
  }

  const addresses = [
    originAddress,
    ...deliveryStops.map((preorder) => preorder.normalizedDeliveryAddress || preorder.address),
  ];
  const matrix = await getDrivingDistanceMatrixKm(addresses);
  const route = optimizeRouteWithTwoOpt(buildNearestNeighborRoute(matrix), matrix);
  let cumulativeDistanceKm = 0;

  const stops = route.slice(1).map((addressIndex, stopIndex) => {
    const previousAddressIndex = route[stopIndex];
    const preorder = deliveryStops[addressIndex - 1];
    const legDistanceKm = Number(matrix[previousAddressIndex]?.[addressIndex] || 0);
    cumulativeDistanceKm += legDistanceKm;

    return {
      stopNumber: stopIndex + 1,
      preorderId: preorder.id,
      customerName: preorder.customerName,
      phone: preorder.phone,
      email: preorder.email || "",
      address: preorder.normalizedDeliveryAddress || preorder.address,
      totalQuantity: Number(preorder.totalQuantity || 0),
      total: Number(preorder.total || preorder.subtotal || 0),
      status: preorder.status,
      deliveredAt: preorder.deliveredAt || null,
      legDistanceKm,
      cumulativeDistanceKm,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        preorder.normalizedDeliveryAddress || preorder.address
      )}`,
      items: (preorder.items || []).map((item) => ({
        sku: item.sku,
        productName: item.productName,
        quantity: Number(item.quantity || 0),
      })),
    };
  });

  const totalDistanceKm = Number(cumulativeDistanceKm.toFixed(2));
  const payoutPerKm = Math.max(0, Number(driverPayoutPerKm || 0));

  return {
    originAddress,
    totalStops: stops.length,
    totalDistanceKm,
    driverPayout: Number((totalDistanceKm * payoutPerKm).toFixed(2)),
    payoutPerKm,
    stops,
  };
};
