import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { calculateDeliveryQuote, isGoogleMapsConfigured } from "@/libs/delivery";
import { getPlaceDetails } from "@/libs/places";
import PreorderWindow from "@/models/PreorderWindow";
import { getActiveWindowFilter, isWindowAcceptingOrders } from "@/libs/preorder-windows";

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
    await connectMongo();

    const body = await req.json();
    const address = body.address?.trim();
    const placeId = body.placeId?.trim() || "";
    const sessionToken = body.sessionToken?.trim() || "";
    const preorderWindowId = body.preorderWindowId?.trim() || "";

    if (!address && !placeId) {
      return NextResponse.json({ error: "Address is required." }, { status: 400 });
    }

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
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
