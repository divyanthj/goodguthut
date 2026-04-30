import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { buildSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";

const sanitizeAdditionalStops = (additionalStops = []) => {
  if (!Array.isArray(additionalStops)) {
    return [];
  }

  return additionalStops.map((stop, index) => ({
    id: String(stop?.id || `additional-${index + 1}`).trim(),
    name: String(stop?.name || "").trim(),
    phone: String(stop?.phone || "").trim(),
    email: String(stop?.email || "").trim(),
    address: String(stop?.address || "").trim(),
  }));
};

const getValidationError = ({ deliveryDate = "", additionalStops = [] } = {}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deliveryDate || "").trim())) {
    return "Choose a valid delivery date.";
  }

  if (additionalStops.length === 0) {
    return "";
  }

  const invalidStop = additionalStops.find(
    (stop) => !stop.id || !stop.name || !stop.phone || !stop.email || !stop.address
  );

  if (invalidStop) {
    return "Enter name, phone, email, and address for every additional stop.";
  }

  return "";
};

export async function POST(req) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const deliveryDate = String(body?.deliveryDate || "").trim();
    const additionalStops = sanitizeAdditionalStops(body?.additionalStops);
    const validationError = getValidationError({ deliveryDate, additionalStops });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const routeSnapshots = await buildSubscriptionRouteSnapshots({
      deliveryDate,
      additionalStops,
    });

    return NextResponse.json({
      routeSnapshot: JSON.parse(JSON.stringify(routeSnapshots[0] || null)),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not preview this route." },
      { status: 500 }
    );
  }
}
