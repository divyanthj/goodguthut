import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { uploadCollatoKnowledgeFile } from "@/libs/collato-knowledge";

export async function POST(req) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const payload = await uploadCollatoKnowledgeFile({
      file,
      title: String(formData.get("title") || file.name || "Admin file"),
      manualNotes: String(formData.get("manualNotes") || ""),
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload knowledge file." },
      { status: 500 }
    );
  }
}
