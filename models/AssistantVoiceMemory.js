import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

const assistantVoiceMemorySchema = mongoose.Schema(
  {
    sessionId: { type: String, trim: true, required: true, maxlength: 120 },
    turnId: { type: String, trim: true, required: true, maxlength: 180 },
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, trim: true, required: true, maxlength: 12000 },
    createdBy: { type: String, trim: true, lowercase: true, required: true, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

assistantVoiceMemorySchema.index({ createdBy: 1, createdAt: -1 });
assistantVoiceMemorySchema.index({ createdBy: 1, sessionId: 1, turnId: 1 }, { unique: true });
assistantVoiceMemorySchema.plugin(toJSON);

export default mongoose.models.AssistantVoiceMemory ||
  mongoose.model("AssistantVoiceMemory", assistantVoiceMemorySchema);
