const DEFAULT_TENANT_SLUG = "ggh";
const SOURCE_APP = "ggh-code";

const getConfig = () => ({
  baseUrl: String(process.env.COLLATO_INTERNAL_API_URL || "").replace(/\/$/, ""),
  secret: process.env.COLLATO_INTERNAL_API_SECRET || "",
  tenantSlug: process.env.COLLATO_TENANT_SLUG || DEFAULT_TENANT_SLUG,
});

const serializeDoc = (doc) => {
  if (!doc) {
    return null;
  }

  if (typeof doc.toJSON === "function") {
    return doc.toJSON();
  }

  return JSON.parse(JSON.stringify(doc));
};

export const isCollatoKnowledgeConfigured = () => {
  const config = getConfig();
  return Boolean(config.baseUrl && config.secret);
};

async function callCollatoKnowledge(path, options = {}) {
  const config = getConfig();

  if (!config.baseUrl || !config.secret) {
    throw new Error("Collato knowledge service is not configured.");
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      "x-collato-internal-secret": config.secret,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `Collato request failed with ${response.status}`);
  }

  return payload;
}

export function buildKnowledgeSource({ sourceType, id, title, data }) {
  const config = getConfig();
  const serialized = serializeDoc(data);
  const sourceId = `${DEFAULT_TENANT_SLUG}:${sourceType}:${id}`;

  return {
    tenantSlug: config.tenantSlug,
    sourceApp: SOURCE_APP,
    sourceType,
    sourceId,
    title,
    text: JSON.stringify(
      {
        title,
        sourceType,
        sourceId,
        data: serialized,
      },
      null,
      2
    ),
    metadata: {
      sourceType,
      localId: String(id),
      adminPath: `/admin/knowledge?source=${encodeURIComponent(sourceId)}`,
    },
    updatedAt: serialized?.updatedAt || new Date().toISOString(),
    createdAt: serialized?.createdAt || new Date().toISOString(),
  };
}

export async function upsertCollatoKnowledgeSource(source) {
  if (!isCollatoKnowledgeConfigured()) {
    return { skipped: true, reason: "not_configured" };
  }

  return callCollatoKnowledge("/api/internal/knowledge/sources", {
    method: "POST",
    body: JSON.stringify(source),
  });
}

export async function deleteCollatoKnowledgeSource({ sourceType, id }) {
  if (!isCollatoKnowledgeConfigured()) {
    return { skipped: true, reason: "not_configured" };
  }

  const config = getConfig();
  const sourceId = `${DEFAULT_TENANT_SLUG}:${sourceType}:${id}`;
  const params = new URLSearchParams({
    tenantSlug: config.tenantSlug,
    sourceApp: SOURCE_APP,
    sourceType,
  });

  return callCollatoKnowledge(
    `/api/internal/knowledge/sources/${encodeURIComponent(sourceId)}?${params.toString()}`,
    { method: "DELETE" }
  );
}

export async function listCollatoKnowledgeSources() {
  if (!isCollatoKnowledgeConfigured()) {
    return { sources: [], configured: false };
  }

  const config = getConfig();
  const params = new URLSearchParams({
    tenantSlug: config.tenantSlug,
    sourceApp: SOURCE_APP,
    limit: "80",
  });
  const payload = await callCollatoKnowledge(`/api/internal/knowledge/sources?${params.toString()}`);
  return { ...payload, configured: true };
}

export async function queryCollatoKnowledge(question) {
  const config = getConfig();
  return callCollatoKnowledge("/api/internal/knowledge/query", {
    method: "POST",
    body: JSON.stringify({
      tenantSlug: config.tenantSlug,
      question,
      limit: 8,
    }),
  });
}

export async function uploadCollatoKnowledgeFile({ file, title, manualNotes }) {
  const config = getConfig();
  const formData = new FormData();
  formData.append("tenantSlug", config.tenantSlug);
  formData.append("sourceApp", SOURCE_APP);
  formData.append("sourceType", "admin_file");
  formData.append("sourceId", `${DEFAULT_TENANT_SLUG}:admin_file:${Date.now()}`);
  formData.append("title", title || file?.name || "Admin file");
  formData.append("manualNotes", manualNotes || "");
  formData.append("file", file);

  return callCollatoKnowledge("/api/internal/knowledge/files", {
    method: "POST",
    body: formData,
  });
}

export async function syncCollatoKnowledgeDocument({ sourceType, id, title, data }) {
  try {
    return await upsertCollatoKnowledgeSource(
      buildKnowledgeSource({ sourceType, id, title, data })
    );
  } catch (error) {
    console.error("Collato knowledge sync failed:", error);
    return { error: error instanceof Error ? error.message : "Sync failed" };
  }
}

export async function removeCollatoKnowledgeDocument({ sourceType, id }) {
  try {
    return await deleteCollatoKnowledgeSource({ sourceType, id });
  } catch (error) {
    console.error("Collato knowledge delete sync failed:", error);
    return { error: error instanceof Error ? error.message : "Delete sync failed" };
  }
}
