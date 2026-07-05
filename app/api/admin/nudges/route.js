import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import {
  listLapsedCustomers,
  sendRetentionNudge,
} from "@/libs/retention-nudges";

const ensureAdmin = async () => {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return null;
};

export async function GET(req) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  await connectMongo();

  const { searchParams } = new URL(req.url);
  const thresholdDays = Number(searchParams.get("thresholdDays") || 60);
  const customers = await listLapsedCustomers({ thresholdDays });

  return NextResponse.json({ customers });
}

export async function POST(req) {
  const authError = await ensureAdmin();

  if (authError) {
    return authError;
  }

  try {
    const body = await req.json();
    const phoneKey = String(body.phoneKey || "").trim();
    const discountCodeId = String(body.discountCodeId || "").trim();

    if (!phoneKey || !discountCodeId) {
      return NextResponse.json(
        { error: "Choose a customer and discount code." },
        { status: 400 }
      );
    }

    await connectMongo();

    const result = await sendRetentionNudge({ phoneKey, discountCodeId });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Could not send retention nudge." },
      { status: 500 }
    );
  }
}
