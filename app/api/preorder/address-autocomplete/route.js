import { NextResponse } from "next/server";
import { autocompleteAddresses, isPlacesConfigured } from "@/libs/places";
import {
  enforceBrowserOrigin,
  isValidSessionToken,
  jsonError,
  logAbuseEvent,
  normalizeAddress,
  normalizeSessionToken,
  readJsonBody,
} from "@/libs/request-protection";

export async function POST(req) {
  try {
    const originError = enforceBrowserOrigin(req);

    if (originError) {
      return originError;
    }

    if (!isPlacesConfigured()) {
      return NextResponse.json(
        { error: "Address autocomplete is unavailable until GOOGLE_MAPS_API_KEY is configured." },
        { status: 503 }
      );
    }

    const body = await readJsonBody(req, { maxBytes: 3 * 1024 });
    const input = normalizeAddress(body.input || "");
    const sessionToken = normalizeSessionToken(body.sessionToken || "");

    if (!isValidSessionToken(sessionToken)) {
      logAbuseEvent("autocomplete-invalid-session-token", req);
      return jsonError("Invalid address lookup session.", 400);
    }

    if (!input || input.length < 3) {
      return NextResponse.json({ suggestions: [] });
    }

    if (input.length > 160) {
      logAbuseEvent("autocomplete-input-too-long", req, { inputLength: input.length });
      return jsonError("Address lookup text is too long.", 400);
    }

    const suggestions = await autocompleteAddresses({ input, sessionToken });

    return NextResponse.json({ suggestions });
  } catch (e) {
    if (e.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("autocomplete-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    if (e.message === "INVALID_JSON") {
      logAbuseEvent("autocomplete-invalid-json", req);
      return jsonError("Request body must be valid JSON.", 400);
    }

    logAbuseEvent("autocomplete-upstream-error", req, { message: e.message });
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
