import { get, put } from "@vercel/blob";

export const ASSISTANT_TIME_ZONE = "Asia/Kolkata";
export const ASSISTANT_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
export const MAX_RECORDING_MS = 10 * 60 * 1000;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_ENTRY_TEXT = 20000;

export const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

export const getConversationDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASSISTANT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export const serializeAssistantEntry = (entry) => {
  const value = entry?.toObject ? entry.toObject() : entry;
  const corrections = value?.corrections || [];
  const latestCorrection = corrections[corrections.length - 1] || null;

  return {
    id: String(value?._id || value?.id || ""),
    originalText: value?.originalText || "",
    displayText: latestCorrection?.text || value?.originalText || "",
    role: value?.role || "user",
    parentEntryId: value?.parentEntryId ? String(value.parentEntryId) : null,
    inputType: value?.inputType || "text",
    createdBy: value?.createdBy || "",
    conversationDate: value?.conversationDate || getConversationDate(value?.createdAt),
    transcriptionModel: value?.transcriptionModel || "",
    processingStatus: value?.processingStatus || "logged",
    processingError: value?.processingError || "",
    audio: value?.audio?.pathname
      ? {
          available: true,
          contentType: value.audio.contentType || "audio/webm",
          size: Number(value.audio.size || 0),
          durationMs: Number(value.audio.durationMs || 0),
          cleanupStatus: value.audio.cleanupStatus || "none",
        }
      : { available: false },
    corrections: corrections.map((correction) => ({
      text: correction.text,
      correctedBy: correction.correctedBy,
      correctedAt: correction.correctedAt?.toISOString?.() || correction.correctedAt,
    })),
    answerModel: value?.answerModel || "",
    responseData: {
      tables: Array.isArray(value?.responseData?.tables) ? value.responseData.tables : [],
      charts: Array.isArray(value?.responseData?.charts) ? value.responseData.charts : [],
      widgets: Array.isArray(value?.responseData?.widgets) ? value.responseData.widgets : [],
      maps: Array.isArray(value?.responseData?.maps) ? value.responseData.maps : [],
      sources: Array.isArray(value?.responseData?.sources) ? value.responseData.sources : [],
      actions: Array.isArray(value?.responseData?.actions) ? value.responseData.actions : [],
    },
    actionStatus: value?.actionStatus || "none",
    schemaVersion: Number(value?.schemaVersion || 1),
    createdAt: value?.createdAt?.toISOString?.() || value?.createdAt,
    updatedAt: value?.updatedAt?.toISOString?.() || value?.updatedAt,
  };
};

export const getAssistantBlobToken = () =>
  String(
    process.env.ASSISTANT_BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_READ_WRITE_TOKEN ||
      ""
  ).trim();

export const uploadAssistantAudio = async ({ file, createdBy }) => {
  const token = getAssistantBlobToken();
  if (!token) throw new Error("Private assistant audio storage is not configured.");

  const safeAdmin = String(createdBy || "admin")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const extension = file.type.includes("mp4")
    ? "m4a"
    : file.type.includes("ogg")
      ? "ogg"
      : file.type.includes("mpeg")
        ? "mp3"
        : file.type.includes("wav")
          ? "wav"
          : "webm";
  const pathname = `admin-assistant/${getConversationDate()}/${safeAdmin || "admin"}-${Date.now()}.${extension}`;
  const blob = await put(pathname, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type || "audio/webm",
    token,
  });

  return { pathname: blob.pathname, contentType: blob.contentType || file.type, size: file.size };
};

export const readAssistantAudio = async (pathname) => {
  const token = getAssistantBlobToken();
  if (!token) throw new Error("Private assistant audio storage is not configured.");
  return get(pathname, { access: "private", token, useCache: false });
};

export const transcribeAudio = async (file) => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI transcription is not configured.");

  const formData = new FormData();
  formData.append("model", ASSISTANT_TRANSCRIPTION_MODEL);
  formData.append("file", file, file.name || "assistant-audio.webm");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI could not transcribe this recording.");
  }
  const text = String(payload.text || "").trim();
  if (!text) throw new Error("The transcription was empty.");
  return text;
};

export const validateAudioFile = (file, durationMs) => {
  if (!(file instanceof File)) return "An audio recording is required.";
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) return "This browser produced an unsupported audio format.";
  if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) return "Recordings must be smaller than 20 MB.";
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_RECORDING_MS) {
    return "Recordings cannot be longer than 10 minutes.";
  }
  return "";
};
