import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Stripe billing portal is not enabled for this site." },
    { status: 410 }
  );
}
