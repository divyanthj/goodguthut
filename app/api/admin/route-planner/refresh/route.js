import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";
import { syncCollatoKnowledgeDocument } from "@/libs/collato-knowledge";

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
    await syncCollatoKnowledgeDocument({
      sourceType: "route_planner_snapshot",
      id: "latest",
      title: "Latest route planner snapshots",
      data: { routeSnapshots: JSON.parse(JSON.stringify(routeSnapshots || [])) },
    });

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
