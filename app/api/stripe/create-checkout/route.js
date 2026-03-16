import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Stripe checkout is not enabled for this site." },
    { status: 410 }
  );
}
