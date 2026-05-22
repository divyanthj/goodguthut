import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { listCollatoKnowledgeSources } from "@/libs/collato-knowledge";

export async function GET() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await listCollatoKnowledgeSources());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list knowledge sources." },
      { status: 500 }
    );
  }
}
