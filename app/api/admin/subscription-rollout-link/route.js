import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";
import {
  buildRecurringRolloutUrl,
  createSignedRecurringRolloutToken,
} from "@/libs/subscription-rollout";

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

const sanitizeHours = (value) => {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    return 24 * 7;
  }

  return Math.max(1, Math.min(24 * 90, Math.round(normalized)));
};

export async function POST(req) {
  const { error } = await getAdminSession();

  if (error) {
    return error;
  }

  try {
    const body = await req.json();
    const expiresInHours = sanitizeHours(body.expiresInHours);
    const expiresAt = Date.now() + expiresInHours * 60 * 60 * 1000;
    const token = createSignedRecurringRolloutToken({ expiresAt });
    const url = buildRecurringRolloutUrl(token, req?.nextUrl?.origin || "");

    return NextResponse.json({
      token,
      url,
      expiresAt,
      expiresInHours,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
