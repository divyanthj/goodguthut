import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import connectMongo from "@/libs/mongoose";
import { normalizeGeoPerkPayload } from "@/libs/geo-perks";
import GeoPerk from "@/models/GeoPerk";

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

export async function GET(_req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();
  const geoPerk = await GeoPerk.findById(params.id);

  if (!geoPerk) {
    return NextResponse.json({ error: "Geo perk not found." }, { status: 404 });
  }

  return NextResponse.json({ geoPerk });
}

export async function PUT(req, { params }) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  await connectMongo();

  try {
    const payload = normalizeGeoPerkPayload(await req.json());

    if (!payload.name) {
      return NextResponse.json({ error: "Perk name is required." }, { status: 400 });
    }

    if (!payload.areaLabel) {
      return NextResponse.json({ error: "Area label is required." }, { status: 400 });
    }

    if (payload.matchTerms.length === 0) {
      return NextResponse.json({ error: "Add at least one match term." }, { status: 400 });
    }

    const geoPerk = await GeoPerk.findByIdAndUpdate(params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!geoPerk) {
      return NextResponse.json({ error: "Geo perk not found." }, { status: 404 });
    }

    return NextResponse.json({ geoPerk });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  return PUT(req, { params });
}
