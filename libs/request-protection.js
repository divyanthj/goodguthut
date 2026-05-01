import { NextResponse } from "next/server";
import mongoose from "mongoose";
import config from "@/config";

const DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

const SAME_SITE_VALUES = new Set(["same-origin", "same-site", "none"]);

const getAllowedOrigins = () => {
  const origins = new Set(DEV_ORIGINS);
  const configuredOrigins = String(process.env.ALLOWED_BROWSER_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (config.domainName) {
    origins.add(`https://${config.domainName}`);
    origins.add(`https://www.${config.domainName}`);
  }

  configuredOrigins.forEach((origin) => origins.add(origin));

  return origins;
};

const isAllowedDevelopmentOrigin = (origin = "") => {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  try {
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1")
    );
  } catch (_error) {
    return false;
  }
};

export const getClientIp = (req) => {
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-vercel-forwarded-for") ||
    "unknown"
  );
};

export const logAbuseEvent = (type, req, details = {}) => {
  console.warn(
    JSON.stringify({
      category: "abuse-protection",
      type,
      path: new URL(req.url).pathname,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent") || "",
      ...details,
    })
  );
};

export const jsonError = (error, status, extra = {}) => {
  return NextResponse.json({ error, ...extra }, { status });
};

export const enforceBrowserOrigin = (req) => {
  const origin = req.headers.get("origin");
  const secFetchSite = req.headers.get("sec-fetch-site");

  if (!origin) {
    if (secFetchSite && !SAME_SITE_VALUES.has(secFetchSite)) {
      logAbuseEvent("invalid-origin", req, { origin: "", secFetchSite });
      return jsonError("Cross-site requests are not allowed.", 403);
    }

    return null;
  }

  if (!getAllowedOrigins().has(origin) && !isAllowedDevelopmentOrigin(origin)) {
    logAbuseEvent("invalid-origin", req, { origin, secFetchSite: secFetchSite || "" });
    return jsonError("Cross-site requests are not allowed.", 403);
  }

  return null;
};

export const readJsonBody = async (req, { maxBytes }) => {
  const contentLength = Number(req.headers.get("content-length") || 0);

  if (contentLength > maxBytes) {
    throw new Error("REQUEST_TOO_LARGE");
  }

  const rawBody = await req.text();
  const rawSize = Buffer.byteLength(rawBody, "utf8");

  if (rawSize > maxBytes) {
    throw new Error("REQUEST_TOO_LARGE");
  }

  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    throw new Error("INVALID_JSON");
  }
};

export const normalizeEmail = (value = "") => value.trim().toLowerCase();

export const isValidEmail = (value = "") => {
  if (!value) {
    return false;
  }

  if (value.length > 160) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

export const normalizePhone = (value = "") => value.trim().replace(/[^\d+\s()-]/g, "");

export const isValidPhone = (value = "") => {
  const compact = value.replace(/[^\d]/g, "");
  return compact.length >= 7 && compact.length <= 15;
};

export const normalizeAddress = (value = "") => value.trim().replace(/\s+/g, " ");

export const isValidAddress = (value = "") => {
  return value.length >= 8 && value.length <= 300;
};

export const normalizeName = (value = "") => value.trim().replace(/\s+/g, " ");

export const isValidName = (value = "") => {
  return value.length >= 2 && value.length <= 80;
};

export const normalizeSessionToken = (value = "") => value.trim();

export const isValidSessionToken = (value = "") => {
  if (!value) {
    return true;
  }

  return /^[A-Za-z0-9-]{10,120}$/.test(value);
};

export const isValidPlaceId = (value = "") => {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
};

export const isValidObjectId = (value = "") => mongoose.Types.ObjectId.isValid(value);
