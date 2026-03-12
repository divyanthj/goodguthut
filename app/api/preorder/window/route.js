import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { getActiveWindowFilter } from "@/libs/preorder-windows";

export async function GET() {
  try {
    await connectMongo();

    const preorderWindow = await PreorderWindow.findOne(getActiveWindowFilter()).sort({
      opensAt: -1,
      updatedAt: -1,
      createdAt: -1,
    });

    return NextResponse.json({ preorderWindow });
  } catch (e) {
    console.error(e);

    return NextResponse.json({
      preorderWindow: null,
      error: e.message,
    });
  }
}
