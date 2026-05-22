import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { backfillGghKnowledge } from "@/libs/ggh-knowledge-backfill";

export async function POST() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json(await backfillGghKnowledge());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not backfill knowledge." },
      { status: 500 }
    );
  }
}
