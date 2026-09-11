import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import AssistantVoiceMemory from "@/models/AssistantVoiceMemory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TURN_TEXT = 12000;

const requireAdmin = async () => {
  const state = await getAdminSessionState();
  if (!state.session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!state.isAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { createdBy: String(state.session.user.email || "").toLowerCase() };
};

const cleanIdentifier = (value, maxLength) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "-")
    .slice(0, maxLength);

export async function POST(req) {
  const { createdBy, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const sessionId = cleanIdentifier(body.sessionId, 120);
    const turnId = cleanIdentifier(body.turnId, 180);
    const role = body.role === "assistant" ? "assistant" : body.role === "user" ? "user" : "";
    const text = String(body.text || "").trim();

    if (!sessionId || !turnId || !role || !text) {
      return NextResponse.json({ error: "A complete voice-memory turn is required." }, { status: 400 });
    }
    if (text.length > MAX_TURN_TEXT) {
      return NextResponse.json({ error: "Voice-memory turns cannot exceed 12,000 characters." }, { status: 400 });
    }

    await connectMongo();
    await AssistantVoiceMemory.updateOne(
      { createdBy, sessionId, turnId },
      { $setOnInsert: { createdBy, sessionId, turnId, role, text } },
      { upsert: true }
    );

    return NextResponse.json(
      { remembered: true },
      { status: 201, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (requestError) {
    console.error("Admin voice memory save error", requestError);
    return NextResponse.json({ error: "Could not remember this voice turn." }, { status: 500 });
  }
}

export async function DELETE() {
  const { createdBy, error } = await requireAdmin();
  if (error) return error;

  try {
    await connectMongo();
    const result = await AssistantVoiceMemory.deleteMany({ createdBy });
    return NextResponse.json(
      { cleared: true, deletedCount: result.deletedCount || 0 },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (requestError) {
    console.error("Admin voice memory clear error", requestError);
    return NextResponse.json({ error: "Could not clear voice memory." }, { status: 500 });
  }
}
