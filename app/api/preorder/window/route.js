import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { createDefaultPreorderWindow } from "@/libs/preorder-catalog";

export async function GET() {
  try {
    await connectMongo();

    const preorderWindow = await PreorderWindow.findOne({
      status: { $in: ["draft", "open", "closed"] },
    }).sort({
      updatedAt: -1,
      createdAt: -1,
    });

    if (!preorderWindow) {
      return NextResponse.json({ preorderWindow: createDefaultPreorderWindow() });
    }

    return NextResponse.json({ preorderWindow });
  } catch (e) {
    console.error(e);

    return NextResponse.json({
      preorderWindow: createDefaultPreorderWindow(),
      error: e.message,
    });
  }
}
