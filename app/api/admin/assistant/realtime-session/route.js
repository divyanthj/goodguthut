import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { ASSISTANT_TRANSCRIPTION_MODEL } from "@/libs/admin-assistant";

export async function POST() {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI transcription is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transcription: { model: ASSISTANT_TRANSCRIPTION_MODEL },
              noise_reduction: { type: "near_field" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 700,
              },
            },
          },
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenAI realtime session error", response.status, payload);
      return NextResponse.json(
        { error: payload?.error?.message || "Could not start live transcription." },
        { status: response.status }
      );
    }
    return NextResponse.json({
      clientSecret: payload?.value || payload?.client_secret?.value || payload?.client_secret,
      model: ASSISTANT_TRANSCRIPTION_MODEL,
    });
  } catch (sessionError) {
    return NextResponse.json(
      { error: sessionError instanceof Error ? sessionError.message : "Could not start live transcription." },
      { status: 500 }
    );
  }
}
