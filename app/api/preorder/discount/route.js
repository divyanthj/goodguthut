import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { sanitizePreorderItems } from "@/libs/preorder-request";
import { resolveDiscountCode } from "@/libs/discount-codes";
import PreorderWindow from "@/models/PreorderWindow";
import { getSkuMap, listSkuCatalog, normalizeAllowedItemRefs } from "@/libs/sku-catalog";
import {
  enforceBrowserOrigin,
  isValidObjectId,
  jsonError,
  logAbuseEvent,
  readJsonBody,
} from "@/libs/request-protection";

export async function POST(req) {
  try {
    const originError = enforceBrowserOrigin(req);

    if (originError) {
      return originError;
    }

    const body = await readJsonBody(req, { maxBytes: 12 * 1024 });
    const preorderWindowId = body.preorderWindowId?.trim() || "";
    const requestItems = sanitizePreorderItems(body.items);

    if (preorderWindowId && !isValidObjectId(preorderWindowId)) {
      return NextResponse.json({ error: "Invalid preorder window." }, { status: 400 });
    }

    if (requestItems.length === 0) {
      return NextResponse.json(
        { error: "Add at least one product before applying a discount code." },
        { status: 400 }
      );
    }

    await connectMongo();

    const skuCatalog = await listSkuCatalog();
    const skuMap = getSkuMap(skuCatalog);
    let preorderWindow = null;

    if (preorderWindowId) {
      preorderWindow = await PreorderWindow.findById(preorderWindowId);

      if (!preorderWindow) {
        return NextResponse.json({ error: "Selected preorder window was not found" }, { status: 400 });
      }
    }

    const allowedItemsBySku = preorderWindow
      ? new Set(normalizeAllowedItemRefs(preorderWindow.allowedItems).map((item) => item.sku))
      : null;

    const subtotal = requestItems.reduce((sum, item) => {
      const catalogItem = skuMap.get(item.sku);

      if (!catalogItem || catalogItem.status !== "active") {
        throw new Error(`SKU ${item.sku} is not currently available`);
      }

      if (allowedItemsBySku && !allowedItemsBySku.has(item.sku)) {
        throw new Error(`SKU ${item.sku} is not available in this preorder window`);
      }

      return sum + Number(item.quantity || 0) * Number(catalogItem.unitPrice || 0);
    }, 0);

    const { discount } = await resolveDiscountCode({
      code: body.discountCode || "",
      subtotal,
    });

    return NextResponse.json({
      subtotal,
      discount,
    });
  } catch (e) {
    console.error(e);

    if (e.message === "REQUEST_TOO_LARGE") {
      logAbuseEvent("preorder-discount-request-too-large", req);
      return jsonError("Request body is too large.", 413);
    }

    if (e.message === "INVALID_JSON") {
      logAbuseEvent("preorder-discount-invalid-json", req);
      return jsonError("Request body must be valid JSON.", 400);
    }

    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
