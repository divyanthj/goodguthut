import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { transcribeAudio, validateAudioFile } from "@/libs/admin-assistant";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    const durationMs = Number(formData.get("durationMs") || 0);
    const validationError = validateAudioFile(audio, durationMs);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const transcript = await transcribeAudio(audio);
    return NextResponse.json(
      { transcript },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not transcribe this recording." },
      { status: 502 }
    );
  }
}
