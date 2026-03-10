import { NextResponse } from "next/server";
import { autocompleteAddresses, isPlacesConfigured } from "@/libs/places";

export async function POST(req) {
  try {
    if (!isPlacesConfigured()) {
      return NextResponse.json(
        { error: "Address autocomplete is unavailable until GOOGLE_MAPS_API_KEY is configured." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const input = body.input?.trim();
    const sessionToken = body.sessionToken?.trim();

    if (!input || input.length < 3) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await autocompleteAddresses({ input, sessionToken });

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
