import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import {
  executeAssistantAction,
  summarizeAssistantActionStatus,
} from "@/libs/admin-assistant-actions";
import { serializeAssistantEntry } from "@/libs/admin-assistant";
import connectMongo from "@/libs/mongoose";
import AssistantEntry from "@/models/AssistantEntry";

export const dynamic = "force-dynamic";

const updateAuditStatus = async (entryId, actionId, updates) => {
  const entry = await AssistantEntry.findById(entryId);
  if (!entry) return null;
  const actions = Array.isArray(entry.responseData?.actions) ? entry.responseData.actions : [];
  const action = actions.find((item) => item.id === actionId);
  if (!action) return null;
  Object.assign(action, updates);
  entry.actionStatus = summarizeAssistantActionStatus(actions);
  entry.markModified("responseData.actions");
  await entry.save();
  return entry;
};

export async function POST(req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: "Action not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const decision = String(body.decision || "");
  if (!["confirm", "cancel"].includes(decision)) {
    return NextResponse.json({ error: "Choose confirm or cancel." }, { status: 400 });
  }

  await connectMongo();
  const now = new Date();
  const adminEmail = String(session.user.email || "").toLowerCase();
  const claimed = await AssistantEntry.findOneAndUpdate(
    {
      _id: params.id,
      role: "assistant",
      "responseData.actions": { $elemMatch: { id: params.actionId, status: "proposed" } },
    },
    {
      $set: decision === "confirm"
        ? {
            "responseData.actions.$.status": "executing",
            "responseData.actions.$.confirmedBy": adminEmail,
            "responseData.actions.$.confirmedAt": now,
          }
        : {
            "responseData.actions.$.status": "cancelled",
            "responseData.actions.$.cancelledBy": adminEmail,
            "responseData.actions.$.cancelledAt": now,
          },
    },
    { new: true }
  );
  if (!claimed) {
    return NextResponse.json(
      { error: "This action was already handled or is no longer available." },
      { status: 409 }
    );
  }

  if (decision === "cancel") {
    claimed.actionStatus = summarizeAssistantActionStatus(claimed.responseData.actions);
    await claimed.save();
    return NextResponse.json({ entry: serializeAssistantEntry(claimed) });
  }

  const proposal = claimed.responseData.actions.find((item) => item.id === params.actionId);
  try {
    const result = await executeAssistantAction(proposal, { adminEmail });
    const completed = await updateAuditStatus(params.id, params.actionId, {
      status: "completed",
      executedAt: new Date(),
      result,
      error: "",
    });
    return NextResponse.json({ entry: serializeAssistantEntry(completed), result });
  } catch (error) {
    const failed = await updateAuditStatus(params.id, params.actionId, {
      status: "failed",
      executedAt: new Date(),
      error: error instanceof Error ? error.message : "Action failed.",
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Action failed.",
        entry: serializeAssistantEntry(failed),
      },
      { status: error?.code === "stale_action" ? 409 : 422 }
    );
  }
}
