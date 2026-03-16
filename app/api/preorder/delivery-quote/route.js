import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { calculateDeliveryQuote, isGoogleMapsConfigured } from "@/libs/delivery";
import { getPlaceDetails } from "@/libs/places";
import PreorderWindow from "@/models/PreorderWindow";
import { getActiveWindowFilter, isWindowAcceptingOrders } from "@/libs/preorder-windows";
import {
  enforceBrowserOrigin,
  isValidAddress,
  isValidObjectId,
  isValidPlaceId,
  isValidSessionToken,
  jsonError,
  logAbuseEvent,
  normalizeAddress,
  normalizeSessionToken,
  readJsonBody,
} from "@/libs/request-protection";

const findWindow = async (preorderWindowId) => {
  if (preorderWindowId) {
    return PreorderWindow.findById(preorderWindowId);
  }

  return PreorderWindow.findOne(getActiveWindowFilter()).sort({
    opensAt: -1,
    updatedAt: -1,
    createdAt: -1,
  });
};

export async function POST(req) {
  try {
    const originError = enforceBrowserOrigin(req);

    if (originError) {
      return originError;
    }

    const body = await readJsonBody(req, { maxBytes: 6 * 1024 });
    const address = normalizeAddress(body.address || "");
    const placeId = body.placeId?.trim() || "";
    const sessionToken = normalizeSessionToken(body.sessionToken || "");
    const preorderWindowId = body.preorderWindowId?.trim() || "";

    if (!address && !placeId) {
      logAbuseEvent("delivery-quote-missing-address", req);
      return jsonError("Address is required.", 400);
    }

    if (address && !isValidAddress(address)) {
      logAbuseEvent("delivery-quote-invalid-address", req, { addressLength: address.length });
      return jsonError("Enter a valid address.", 400);
    }

    if (placeId && !isValidPlaceId(placeId)) {
      logAbuseEvent("delivery-quote-invalid-place-id", req, { placeIdLength: placeId.length });
      return jsonError("Invalid placeId.", 400);
    }

    if (!isValidSessionToken(sessionToken)) {
      logAbuseEvent("delivery-quote-invalid-session-token", req);
      return jsonError("Invalid address lookup session.", 400);
    }

    if (preorderWindowId && !isValidObjectId(preorderWindowId)) {
      logAbuseEvent("delivery-quote-invalid-preorder-window-id", req);
      return jsonError("Invalid preorder window.", 400);
    }

    await connectMongo();
    const preorderWindow = await findWindow(preorderWindowId);

    if (!preorderWindow) {
      return NextResponse.json({ error: "Preorder window not found." }, { status: 404 });
    }

    if (!isWindowAcceptingOrders(preorderWindow)) {
      return NextResponse.json(
        { error: "Preorders are closed for the selected delivery window." },
        { status: 400 }
      );
    }

    if (!isGoogleMapsConfigured()) {
      return NextResponse.json(
        { error: "Delivery quotes are unavailable until GOOGLE_MAPS_API_KEY is configured." },
        { status: 503 }
      );
    }

    const placeDetails = placeId ? await getPlaceDetails({ placeId, sessionToken }) : null;

    const quote = await calculateDeliveryQuote({
      pickupAddress: preorderWindow.pickupAddress,
      deliveryBands: preorderWindow.deliveryBands,
      address,
      placeDetails,
    });

    return NextResponse.json({
      distanceKm: quote.distanceKm,
      deliveryFee: quote.deliveryFee,
      normalizedAddress: quote.normalizedAddress,
      matchedBand: quote.matchedBand,
      currency: preorderWindow.currency || "INR",
      isDeliverable: quote.isDeliverable,
      isConfigured: quote.isConfigured,
      reason: quote.reason,
      location: quote.location,
      placeId: placeDetails?.placeId || placeId,
    });
  } catch (e) {
    if (e.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("delivery-quote-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    if (e.message === "INVALID_JSON") {
      logAbuseEvent("delivery-quote-invalid-json", req);
      return jsonError("Request body must be valid JSON.", 400);
    }

    logAbuseEvent("delivery-quote-upstream-error", req, { message: e.message });
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
