import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import PreorderWindow from "@/models/PreorderWindow";
import { getActiveWindowFilter } from "@/libs/preorder-windows";
import { getSkuMap, hydrateWindowWithCatalog, listSkuCatalog } from "@/libs/sku-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    await connectMongo();
    const skuCatalog = await listSkuCatalog();
    const skuMap = getSkuMap(skuCatalog);

    const preorderWindow = await PreorderWindow.findOne(getActiveWindowFilter()).sort({
      opensAt: -1,
      updatedAt: -1,
      createdAt: -1,
    });

    return NextResponse.json(
      {
        preorderWindow: hydrateWindowWithCatalog(preorderWindow, skuMap),
        skuCatalog,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (e) {
    console.error(e);

    return NextResponse.json(
      {
        preorderWindow: null,
        skuCatalog: [],
        error: e.message,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
}
