import { NextResponse } from "next/server";
import { sendDueSubscriptionRenewals } from "@/libs/subscription-renewals";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await sendDueSubscriptionRenewals();
    return NextResponse.json(result, { status: result.failed ? 500 : 200 });
  } catch (error) {
    console.error("Subscription renewal job failed", error);
    return NextResponse.json({ error: "Could not process renewal reminders." }, { status: 500 });
  }
}
