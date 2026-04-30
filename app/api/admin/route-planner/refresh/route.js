import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";

export async function POST() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const routeSnapshots = await recalculateSubscriptionRouteSnapshots();

    return NextResponse.json({
      ok: true,
      routeSnapshots: JSON.parse(JSON.stringify(routeSnapshots || [])),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not refresh route planner." },
      { status: 500 }
    );
  }
}
