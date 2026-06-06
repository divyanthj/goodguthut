import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { isAdminEmail } from "@/libs/admin";
import { authOptions } from "@/libs/next-auth";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const getAdminSession = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!isAdminEmail(session.user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
};

const sanitizeFilePart = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

const getExtension = (file = {}) => {
  const nameExtension = String(file.name || "").split(".").pop();

  if (nameExtension && nameExtension !== file.name) {
    return sanitizeFilePart(nameExtension).slice(0, 8);
  }

  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  if (file.type === "image/gif") {
    return "gif";
  }

  return "jpg";
};

export async function POST(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN first." },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const sku = sanitizeFilePart(formData.get("sku") || "product");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Upload a JPG, PNG, WebP, or GIF image." },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Upload an image smaller than 5 MB." },
        { status: 400 }
      );
    }

    const extension = getExtension(file);
    const filename = `product-images/${sku || "product"}-${Date.now()}.${extension}`;
    const blob = await put(filename, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: file.size,
    });
  } catch (uploadError) {
    console.error(uploadError);
    return NextResponse.json(
      { error: uploadError.message || "Could not upload image." },
      { status: 500 }
    );
  }
}

