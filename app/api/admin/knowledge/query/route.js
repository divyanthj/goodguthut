import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { queryCollatoKnowledge } from "@/libs/collato-knowledge";

export async function POST(req) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const question = String(body.question || "").trim();

    if (!question) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    return NextResponse.json(await queryCollatoKnowledge(question));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not query knowledge." },
      { status: 500 }
    );
  }
}
