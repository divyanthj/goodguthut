import mongoose from "mongoose";
import { del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { MAX_ENTRY_TEXT, getAssistantBlobToken, serializeAssistantEntry } from "@/libs/admin-assistant";
import connectMongo from "@/libs/mongoose";
import AssistantEntry from "@/models/AssistantEntry";

const authorize = async () => {
  const state = await getAdminSessionState();
  if (!state.session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!state.isAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session: state.session };
};

const validId = (id) => mongoose.isValidObjectId(id);

export async function PATCH(req, { params }) {
  const { session, error } = await authorize();
  if (error) return error;
  if (!validId(params.id)) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const body = await req.json();
  const text = String(body.text || "").trim();
  if (!text || text.length > MAX_ENTRY_TEXT) {
    return NextResponse.json({ error: "Correction must be between 1 and 20,000 characters." }, { status: 400 });
  }

  await connectMongo();
  const entry = await AssistantEntry.findOneAndUpdate(
    { _id: params.id, role: { $ne: "assistant" } },
    { $push: { corrections: { text, correctedBy: session.user.email, correctedAt: new Date() } } },
    { new: true, runValidators: true }
  );
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  return NextResponse.json({ entry: serializeAssistantEntry(entry) });
}

export async function DELETE(req, { params }) {
  const { error } = await authorize();
  if (error) return error;
  if (!validId(params.id)) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  await connectMongo();
  const entry = await AssistantEntry.findById(params.id).select("+audio.pathname");
  if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  if (Array.isArray(entry.responseData?.actions) && entry.responseData.actions.length) {
    return NextResponse.json(
      { error: "Action audit entries cannot be deleted." },
      { status: 409 }
    );
  }
  if (
    entry.role !== "assistant" &&
    await AssistantEntry.exists({ parentEntryId: entry._id, "responseData.actions.0": { $exists: true } })
  ) {
    return NextResponse.json(
      { error: "Messages linked to an action audit cannot be deleted." },
      { status: 409 }
    );
  }

  if (entry.audio?.pathname) {
    entry.audio.cleanupStatus = "pending";
    await entry.save();
    try {
      await del(entry.audio.pathname, { token: getAssistantBlobToken() });
    } catch (cleanupError) {
      entry.audio.cleanupStatus = "failed";
      entry.processingError = `Audio deletion failed: ${cleanupError.message || "unknown error"}`;
      await entry.save();
      return NextResponse.json({ error: "Audio could not be deleted. The entry was retained so cleanup can be retried." }, { status: 502 });
    }
  }

  await entry.deleteOne();
  if (entry.role === "user") {
    await AssistantEntry.deleteMany({ parentEntryId: entry._id });
  }
  return new NextResponse(null, { status: 204 });
}
