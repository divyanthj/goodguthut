import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { readAssistantAudio, serializeAssistantEntry, transcribeAudio } from "@/libs/admin-assistant";
import connectMongo from "@/libs/mongoose";
import { createAssistantReply } from "@/libs/admin-assistant-answer";
import AssistantEntry from "@/models/AssistantEntry";

export async function POST(req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!mongoose.isValidObjectId(params.id)) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  await connectMongo();
  const entry = await AssistantEntry.findById(params.id).select("+audio.pathname");
  if (!entry?.audio?.pathname) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  if (entry.processingStatus !== "transcription_failed") {
    return NextResponse.json({ error: "This recording does not need transcription retry." }, { status: 409 });
  }

  entry.processingStatus = "transcribing";
  entry.processingError = "";
  await entry.save();
  try {
    const result = await readAssistantAudio(entry.audio.pathname);
    if (!result || result.statusCode !== 200) throw new Error("Stored audio could not be read.");
    const blob = await new Response(result.stream, { headers: { "Content-Type": result.blob.contentType } }).blob();
    const extension = result.blob.contentType.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `assistant-audio.${extension}`, { type: result.blob.contentType });
    entry.originalText = await transcribeAudio(file);
    entry.processingStatus = "logged";
    entry.processingError = "";
    await entry.save();
    const assistantEntry = await createAssistantReply({
      userEntry: entry,
      createdBy: String(session.user.email || "").toLowerCase(),
    });
    return NextResponse.json({
      entry: serializeAssistantEntry(entry),
      assistantEntry: serializeAssistantEntry(assistantEntry),
      acknowledgement:
        assistantEntry.processingStatus === "logged"
          ? "Answered and logged."
          : "Transcription logged. The answer can be retried.",
    });
  } catch (retryError) {
    entry.processingStatus = "transcription_failed";
    entry.processingError = retryError.message || "Transcription failed.";
    await entry.save();
    return NextResponse.json({ error: entry.processingError, entry: serializeAssistantEntry(entry) }, { status: 502 });
  }
}
