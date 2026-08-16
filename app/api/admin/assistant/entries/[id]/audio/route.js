import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { readAssistantAudio } from "@/libs/admin-assistant";
import connectMongo from "@/libs/mongoose";
import AssistantEntry from "@/models/AssistantEntry";

export async function GET(req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!mongoose.isValidObjectId(params.id)) return NextResponse.json({ error: "Audio not found." }, { status: 404 });

  await connectMongo();
  const entry = await AssistantEntry.findById(params.id).select("+audio.pathname audio.contentType");
  if (!entry?.audio?.pathname) return NextResponse.json({ error: "Audio not found." }, { status: 404 });

  try {
    const result = await readAssistantAudio(entry.audio.pathname);
    if (!result || result.statusCode !== 200) return NextResponse.json({ error: "Audio not found." }, { status: 404 });
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || entry.audio.contentType || "audio/webm",
        "Content-Length": String(result.blob.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (audioError) {
    return NextResponse.json({ error: audioError.message || "Could not load audio." }, { status: 500 });
  }
}
