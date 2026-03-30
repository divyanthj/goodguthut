import crypto from "crypto";
import config from "@/config";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const getSecret = () =>
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
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
};

export const createSignedSubscriptionEditToken = ({
  subscriptionId,
  email,
  expiresAt = Date.now() + TOKEN_TTL_MS,
}) => {
  const secret = getSecret();

  if (!secret) {
    throw new Error("SUBSCRIPTION_EDIT_TOKEN_SECRET or NEXTAUTH_SECRET is required.");
  }

  const payload = base64UrlEncode(
    JSON.stringify({
      subscriptionId: String(subscriptionId || ""),
      email: String(email || "").trim().toLowerCase(),
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

export const verifySignedSubscriptionEditToken = (token = "") => {
  const secret = getSecret();

  if (!secret || !token || !token.includes(".")) {
    return { isValid: false, reason: "missing_token" };
  }

  const [payload, signature] = token.split(".");
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

    if (!decoded.subscriptionId || !decoded.email || !expiresAt) {
      return { isValid: false, reason: "invalid_payload" };
    }

    if (Date.now() > expiresAt) {
      return { isValid: false, reason: "expired" };
    }

    return {
      isValid: true,
      subscriptionId: String(decoded.subscriptionId),
      email: String(decoded.email).trim().toLowerCase(),
      expiresAt,
    };
  } catch (_error) {
    return { isValid: false, reason: "invalid_payload" };
  }
};

export const buildSubscriptionEditUrl = (token) => {
  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    `https://${config.domainName}`;

  return `${siteUrl.replace(/\/+$/g, "")}/subscriptions/edit?token=${encodeURIComponent(token)}`;
};
