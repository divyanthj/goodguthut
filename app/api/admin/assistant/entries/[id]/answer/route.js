import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { generateAssistantAnswer, ADMIN_CHAT_MODEL } from "@/libs/admin-assistant-answer";
import { serializeAssistantEntry } from "@/libs/admin-assistant";
import connectMongo from "@/libs/mongoose";
import AssistantEntry from "@/models/AssistantEntry";

export async function POST(req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: "Response not found." }, { status: 404 });
  }

  await connectMongo();
  const assistantEntry = await AssistantEntry.findById(params.id);
  if (!assistantEntry || assistantEntry.role !== "assistant" || !assistantEntry.parentEntryId) {
    return NextResponse.json({ error: "Response not found." }, { status: 404 });
  }
  if (assistantEntry.processingStatus !== "answer_failed") {
    return NextResponse.json({ error: "This response does not need a retry." }, { status: 409 });
  }
  const userEntry = await AssistantEntry.findById(assistantEntry.parentEntryId);
  if (!userEntry) return NextResponse.json({ error: "Original message not found." }, { status: 404 });

  assistantEntry.processingStatus = "answering";
  assistantEntry.processingError = "";
  await assistantEntry.save();
  try {
    const result = await generateAssistantAnswer({ userEntry });
    assistantEntry.originalText = result.answer;
    assistantEntry.responseData = {
      tables: result.tables,
      charts: result.charts,
      widgets: result.widgets,
      maps: result.maps,
      sources: result.sources,
      actions: result.actions,
    };
    assistantEntry.actionStatus = result.actions.length ? "proposed" : "none";
    assistantEntry.answerModel = ADMIN_CHAT_MODEL;
    assistantEntry.processingStatus = "logged";
    await assistantEntry.save();
    return NextResponse.json({ entry: serializeAssistantEntry(assistantEntry) });
  } catch (error) {
    assistantEntry.processingStatus = "answer_failed";
    assistantEntry.processingError = error instanceof Error ? error.message : "Answer generation failed.";
    await assistantEntry.save();
    return NextResponse.json(
      { error: assistantEntry.processingError, entry: serializeAssistantEntry(assistantEntry) },
      { status: 502 }
    );
  }
}
