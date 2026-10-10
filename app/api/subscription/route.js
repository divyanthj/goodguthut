import { POST as createOrderPlan } from "@/app/api/order-plan/route";
import { enforceBrowserOrigin, readJsonBody, jsonError } from "@/libs/request-protection";

// Keep the old creation URL compatible without creating an autopay mandate.
export async function POST(req) {
  const originError = enforceBrowserOrigin(req);
  if (originError) return originError;
  try {
    const body = await readJsonBody(req, { maxBytes: 24 * 1024 });
    return createOrderPlan(new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ ...body, mode: "subscription", cadence: "weekly" }),
    }));
  } catch (error) {
    return jsonError(error.message === "REQUEST_TOO_LARGE" ? "Request body is too large." : "Invalid subscription request.", error.message === "REQUEST_TOO_LARGE" ? 413 : 400);
  }
}
