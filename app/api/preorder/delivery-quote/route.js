import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { calculateDeliveryQuote, isGoogleMapsConfigured } from "@/libs/delivery";
import PreorderWindow from "@/models/PreorderWindow";

const findWindow = async (preorderWindowId) => {
  if (preorderWindowId) {
    return PreorderWindow.findById(preorderWindowId);
  }

  return PreorderWindow.findOne({
    status: { $in: ["draft", "open", "closed"] },
  }).sort({ updatedAt: -1, createdAt: -1 });
};

export async function POST(req) {
  try {
    await connectMongo();

    const body = await req.json();
    const address = body.address?.trim();
    const preorderWindowId = body.preorderWindowId?.trim() || "";

    if (!address) {
      return NextResponse.json({ error: "Address is required." }, { status: 400 });
    }

    const preorderWindow = await findWindow(preorderWindowId);

    if (!preorderWindow) {
      return NextResponse.json({ error: "Preorder window not found." }, { status: 404 });
    }

    if (!isGoogleMapsConfigured()) {
      return NextResponse.json(
        { error: "Delivery quotes are unavailable until GOOGLE_MAPS_API_KEY is configured." },
        { status: 503 }
      );
    }

    const quote = await calculateDeliveryQuote({
      pickupAddress: preorderWindow.pickupAddress,
      deliveryBands: preorderWindow.deliveryBands,
      address,
    });

    return NextResponse.json({
      distanceKm: quote.distanceKm,
      deliveryFee: quote.deliveryFee,
      normalizedAddress: quote.normalizedAddress,
      matchedBand: quote.matchedBand,
      currency: preorderWindow.currency || "INR",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
