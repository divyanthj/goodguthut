import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Stripe webhooks are not enabled for this site." },
    { status: 410 }
  );
}
