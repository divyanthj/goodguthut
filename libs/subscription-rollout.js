import crypto from "crypto";
import config from "@/config";

export const RECURRING_ROLLOUT_QUERY_PARAM = "sub_access";

const DEFAULT_RECURRING_ROLLOUT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const getRolloutSecret = () =>
  process.env.SUBSCRIPTION_ROLLOUT_TOKEN_SECRET ||
  process.env.SUBSCRIPTION_EDIT_TOKEN_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "";

const base64UrlEncode = (value) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlDecode = (value) => {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
};

const getSiteUrl = () =>
  process.env.SITE_URL ||
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  `https://${config.domainName}`;

export const createSignedRecurringRolloutToken = ({
  expiresAt = Date.now() + DEFAULT_RECURRING_ROLLOUT_TOKEN_TTL_MS,
} = {}) => {
  const secret = getRolloutSecret();

  if (!secret) {
    throw new Error(
      "SUBSCRIPTION_ROLLOUT_TOKEN_SECRET, SUBSCRIPTION_EDIT_TOKEN_SECRET, or NEXTAUTH_SECRET is required."
    );
  }

  const payload = base64UrlEncode(
    JSON.stringify({
      scope: "recurring_rollout",
      exp: Number(expiresAt),
    })
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${payload}.${signature}`;
};

export const verifySignedRecurringRolloutToken = (token = "") => {
  const secret = getRolloutSecret();

  if (!secret || !token || !String(token).includes(".")) {
    return { isValid: false, reason: "missing_token" };
  }

  const [payload, signature] = String(token).split(".");
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(signature || "", "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return { isValid: false, reason: "invalid_signature" };
  }

  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { isValid: false, reason: "invalid_signature" };
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    const expiresAt = Number(decoded.exp || 0);

    if (decoded.scope !== "recurring_rollout" || !expiresAt) {
      return { isValid: false, reason: "invalid_payload" };
    }

    if (Date.now() >= expiresAt) {
      return { isValid: false, reason: "expired" };
    }

    return { isValid: true, expiresAt };
  } catch (_error) {
    return { isValid: false, reason: "invalid_payload" };
  }
};

export const buildRecurringRolloutUrl = (token = "", baseUrl = "") => {
  const resolvedBaseUrl = String(baseUrl || "").trim() || getSiteUrl();
  const siteUrl = resolvedBaseUrl.replace(/\/+$/g, "");
  return `${siteUrl}/?${RECURRING_ROLLOUT_QUERY_PARAM}=${encodeURIComponent(
    token
  )}`;
};
