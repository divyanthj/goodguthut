import { NextResponse } from "next/server";
import { getPlaceDetails, isPlacesConfigured } from "@/libs/places";
import {
  enforceBrowserOrigin,
  isValidPlaceId,
  isValidSessionToken,
  jsonError,
  logAbuseEvent,
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
        { error: "Address lookup is unavailable until GOOGLE_MAPS_API_KEY is configured." },
        { status: 503 }
      );
    }

    const body = await readJsonBody(req, { maxBytes: 3 * 1024 });
    const placeId = (body.placeId || "").trim();
    const sessionToken = normalizeSessionToken(body.sessionToken || "");

    if (!placeId) {
      logAbuseEvent("address-place-missing-place-id", req);
      return jsonError("A placeId is required.", 400);
    }

    if (!isValidPlaceId(placeId)) {
      logAbuseEvent("address-place-invalid-place-id", req, { placeIdLength: placeId.length });
      return jsonError("Invalid placeId.", 400);
    }

    if (!isValidSessionToken(sessionToken)) {
      logAbuseEvent("address-place-invalid-session-token", req);
      return jsonError("Invalid address lookup session.", 400);
    }

    const place = await getPlaceDetails({ placeId, sessionToken });

    return NextResponse.json({ place });
  } catch (e) {
    if (e.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("address-place-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    if (e.message === "INVALID_JSON") {
      logAbuseEvent("address-place-invalid-json", req);
      return jsonError("Request body must be valid JSON.", 400);
    }

    logAbuseEvent("address-place-upstream-error", req, { message: e.message });
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
