import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import {
  ASSISTANT_TRANSCRIPTION_MODEL,
  MAX_ENTRY_TEXT,
  getAssistantBlobToken,
  getConversationDate,
  serializeAssistantEntry,
  transcribeAudio,
  uploadAssistantAudio,
  validateAudioFile,
} from "@/libs/admin-assistant";
import connectMongo from "@/libs/mongoose";
import { createAssistantReply } from "@/libs/admin-assistant-answer";
import AssistantEntry from "@/models/AssistantEntry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requireAdmin = async () => {
  const state = await getAdminSessionState();
  if (!state.session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!state.isAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session: state.session };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function GET(req) {
  const { error } = await requireAdmin();
  if (error) return error;

  await connectMongo();
  const beforeValue = req.nextUrl.searchParams.get("before");
  const before = beforeValue ? new Date(beforeValue) : null;
  const search = String(req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 40, 1), 100);
  const query = search
    ? {
        $or: [
          { originalText: new RegExp(escapeRegExp(search), "i") },
          { "corrections.text": new RegExp(escapeRegExp(search), "i") },
          { "responseData.actions.target": new RegExp(escapeRegExp(search), "i") },
          { "responseData.actions.summary": new RegExp(escapeRegExp(search), "i") },
        ],
      }
    : before && !Number.isNaN(before.getTime())
      ? { createdAt: { $lt: before } }
      : {};
  const docs = await AssistantEntry.find(query).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);

  return NextResponse.json(
    {
      entries: page.map(serializeAssistantEntry),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.createdAt?.toISOString() : null,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}

export async function POST(req) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  let uploadedPathname = "";
  let savedEntry = null;
  try {
    const contentType = req.headers.get("content-type") || "";
    let inputType = "text";
    let originalText = "";
    let durationMs = 0;
    let audioFile = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      inputType = "voice";
      originalText = String(formData.get("text") || "").trim();
      durationMs = Number(formData.get("durationMs") || 0);
      audioFile = formData.get("audio");
      const validationError = validateAudioFile(audioFile, durationMs);
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    } else {
      const body = await req.json();
      originalText = String(body.text || "").trim();
    }

    if (originalText.length > MAX_ENTRY_TEXT) {
      return NextResponse.json({ error: "Entries cannot exceed 20,000 characters." }, { status: 400 });
    }
    if (inputType === "text" && !originalText) {
      return NextResponse.json({ error: "Enter a note to log." }, { status: 400 });
    }

    const createdBy = String(session.user.email || "").toLowerCase();
    let audio = {};
    let processingStatus = "logged";
    let processingError = "";

    if (audioFile) {
      audio = await uploadAssistantAudio({ file: audioFile, createdBy });
      uploadedPathname = audio.pathname;
      audio.durationMs = durationMs;
      audio.cleanupStatus = "none";

      if (!originalText) {
        try {
          originalText = await transcribeAudio(audioFile);
        } catch (transcriptionError) {
          processingStatus = "transcription_failed";
          processingError = transcriptionError.message || "Transcription failed.";
        }
      }
    }

    const entry = await AssistantEntry.create({
      originalText,
      role: "user",
      inputType,
      createdBy,
      conversationDate: getConversationDate(),
      transcriptionModel: inputType === "voice" ? ASSISTANT_TRANSCRIPTION_MODEL : "",
      processingStatus,
      processingError,
      audio,
      actionStatus: "none",
      schemaVersion: 2,
    });
    savedEntry = entry;

    const assistantEntry =
      processingStatus === "logged" && originalText
        ? await createAssistantReply({ userEntry: entry, createdBy })
        : null;

    return NextResponse.json(
      {
        entry: serializeAssistantEntry(entry),
        assistantEntry: assistantEntry ? serializeAssistantEntry(assistantEntry) : null,
        acknowledgement:
          assistantEntry?.processingStatus === "logged"
            ? "Answered and logged."
            : assistantEntry
              ? "Message logged. The answer can be retried."
              : "Logged.",
      },
      { status: 201 }
    );
  } catch (requestError) {
    if (uploadedPathname && !savedEntry) {
      await del(uploadedPathname, { token: getAssistantBlobToken() }).catch(() => {});
    }
    console.error("Admin assistant entry error", requestError);
    return NextResponse.json(
      { error: requestError instanceof Error ? requestError.message : "Could not save this entry." },
      { status: 500 }
    );
  }
}
