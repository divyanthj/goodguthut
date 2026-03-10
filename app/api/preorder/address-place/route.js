import { NextResponse } from "next/server";
import { getPlaceDetails, isPlacesConfigured } from "@/libs/places";

export async function POST(req) {
  try {
    if (!isPlacesConfigured()) {
      return NextResponse.json(
        { error: "Address lookup is unavailable until GOOGLE_MAPS_API_KEY is configured." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const placeId = body.placeId?.trim();
    const sessionToken = body.sessionToken?.trim();

    if (!placeId) {
      return NextResponse.json({ error: "A placeId is required." }, { status: 400 });
    }

    const place = await getPlaceDetails({ placeId, sessionToken });

    return NextResponse.json({ place });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
