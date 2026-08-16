import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const correctionSchema = mongoose.Schema(
  {
    text: { type: String, trim: true, required: true, maxlength: 20000 },
    correctedBy: { type: String, trim: true, lowercase: true, required: true },
    correctedAt: { type: Date, default: Date.now, required: true },
  },
  { _id: false }
);

const audioSchema = mongoose.Schema(
  {
    pathname: { type: String, trim: true, default: "", private: true },
    contentType: { type: String, trim: true, default: "" },
    size: { type: Number, min: 0, default: 0 },
    durationMs: { type: Number, min: 0, max: 600000, default: 0 },
    cleanupStatus: {
      type: String,
      enum: ["none", "pending", "failed"],
      default: "none",
    },
  },
  { _id: false }
);

const assistantEntrySchema = mongoose.Schema(
  {
    originalText: { type: String, trim: true, default: "", maxlength: 20000 },
    role: { type: String, enum: ["user", "assistant"], default: "user", index: true },
    parentEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssistantEntry",
      default: null,
      index: true,
    },
    inputType: { type: String, enum: ["text", "voice"], required: true },
    createdBy: { type: String, trim: true, lowercase: true, required: true, index: true },
    conversationDate: { type: String, trim: true, required: true, index: true },
    transcriptionModel: { type: String, trim: true, default: "" },
    processingStatus: {
      type: String,
      enum: ["logged", "transcription_failed", "transcribing", "answering", "answer_failed"],
      default: "logged",
      index: true,
    },
    processingError: { type: String, trim: true, default: "" },
    audio: { type: audioSchema, default: () => ({}) },
    corrections: { type: [correctionSchema], default: [] },
    answerModel: { type: String, trim: true, default: "" },
    responseData: {
      tables: { type: [mongoose.Schema.Types.Mixed], default: [] },
      charts: { type: [mongoose.Schema.Types.Mixed], default: [] },
      widgets: { type: [mongoose.Schema.Types.Mixed], default: [] },
      maps: { type: [mongoose.Schema.Types.Mixed], default: [] },
      sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
      actions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    actionStatus: {
      type: String,
      enum: ["none", "proposed", "completed", "partially_completed", "cancelled", "failed"],
      default: "none",
      index: true,
    },
    schemaVersion: { type: Number, default: 1 },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

assistantEntrySchema.index({ conversationDate: -1, createdAt: -1 });
assistantEntrySchema.index({ parentEntryId: 1, createdAt: 1 });
assistantEntrySchema.plugin(toJSON);

export default mongoose.models.AssistantEntry ||
  mongoose.model("AssistantEntry", assistantEntrySchema);
