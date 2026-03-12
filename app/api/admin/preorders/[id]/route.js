import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { getAdminSessionState } from "@/libs/admin-auth";
import Preorder from "@/models/Preorder";

export async function PATCH(req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectMongo();

  try {
    const body = await req.json();
    const deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null;

    if (!deliveredAt || Number.isNaN(deliveredAt.getTime())) {
      return NextResponse.json({ error: "A valid delivery time is required." }, { status: 400 });
    }

    const preorder = await Preorder.findById(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
    }

    preorder.deliveredAt = deliveredAt;
    preorder.status = "fulfilled";
    await preorder.save();

    return NextResponse.json({ preorder });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectMongo();

  try {
    const preorder = await Preorder.findByIdAndDelete(params.id);

    if (!preorder) {
      return NextResponse.json({ error: "Preorder not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
