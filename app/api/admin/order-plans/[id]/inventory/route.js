import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import { calculateSmallCartFee } from "@/libs/cart-fee";
import { calculateDiscountAmount } from "@/libs/discount-codes";
import {
  commitOneTimeOrderInventory,
  getOrderInventorySummary,
  markManualOrderPaid,
  releaseOrderInventory,
  replaceManualOrderItems,
  syncRecurringOrderInventory,
} from "@/libs/inventory";
import connectMongo from "@/libs/mongoose";
import { MAX_TOTAL_QTY, ONE_TIME_MIN_TOTAL_QTY } from "@/libs/order-quantity";
import OrderPlan from "@/models/OrderPlan";
import Sku from "@/models/Sku";

const ensureAdmin = async () => {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session };
};

const serialize = (value) => JSON.parse(JSON.stringify(value));

const buildEditedItems = async ({ orderPlan, requestedItems }) => {
  const quantityMap = new Map();
  for (const item of Array.isArray(requestedItems) ? requestedItems : []) {
    const sku = String(item?.sku || "").trim().toUpperCase();
    const quantity = Math.round(Number(item?.quantity || 0));
    if (!sku || quantity < 1 || quantity > 10) {
      throw new Error("Each item needs a valid SKU and a quantity from 1 to 10.");
    }
    quantityMap.set(sku, (quantityMap.get(sku) || 0) + quantity);
  }

  if (!quantityMap.size || quantityMap.size > 12) {
    throw new Error("Add between 1 and 12 distinct products.");
  }
  const totalQuantity = [...quantityMap.values()].reduce((sum, value) => sum + value, 0);
  if (totalQuantity < ONE_TIME_MIN_TOTAL_QTY || totalQuantity > MAX_TOTAL_QTY) {
    throw new Error(
      `The order must contain between ${ONE_TIME_MIN_TOTAL_QTY} and ${MAX_TOTAL_QTY} items.`
    );
  }

  const skuCodes = [...quantityMap.keys()];
  const skuDocs = await Sku.find({ sku: { $in: skuCodes }, status: "active" });
  const skuMap = new Map(skuDocs.map((sku) => [sku.sku, sku]));
  const existingMap = new Map((orderPlan.items || []).map((item) => [item.sku, item]));
  const missingSku = skuCodes.find((sku) => !skuMap.has(sku));
  if (missingSku) {
    throw new Error(`SKU ${missingSku} is not active or does not exist.`);
  }

  const items = skuCodes.map((sku) => {
    const catalogItem = skuMap.get(sku);
    const existingItem = existingMap.get(sku);
    const quantity = quantityMap.get(sku);
    const unitPrice = Math.max(
      0,
      Number(existingItem?.unitPrice ?? catalogItem.unitPrice ?? 0)
    );
    return {
      sku,
      productName: catalogItem.name,
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discountPercent = Math.max(0, Math.min(100, Number(orderPlan.discount?.amount || 0)));
  const discountAmount = calculateDiscountAmount({ subtotal, amount: discountPercent });
  const discount = {
    ...(orderPlan.discount?.toObject?.() || orderPlan.discount || {}),
    amount: discountPercent,
    discountAmount,
    subtotalAfterDiscount: Math.max(0, subtotal - discountAmount),
  };
  const smallCartFee = calculateSmallCartFee(totalQuantity);
  const total = discount.subtotalAfterDiscount + Number(orderPlan.deliveryFee || 0) + smallCartFee;

  return {
    items,
    pricing: { totalQuantity, subtotal, discount, smallCartFee, total },
  };
};

export async function PATCH(req, { params }) {
  const { session, error } = await ensureAdmin();
  if (error) return error;
  await connectMongo();

  try {
    const body = await req.json();
    const action = String(body?.action || "").trim();
    const actor = { actorType: "admin", actorEmail: session.user.email || "" };
    let orderPlan = await OrderPlan.findById(params.id);
    if (!orderPlan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (action === "edit_hold") {
      const edited = await buildEditedItems({
        orderPlan,
        requestedItems: body?.items,
      });
      orderPlan = await replaceManualOrderItems({
        orderPlanId: orderPlan.id,
        ...edited,
        actor,
      });
    } else if (action === "mark_paid") {
      orderPlan = await markManualOrderPaid({ orderPlanId: orderPlan.id, actor });
    } else if (action === "cancel_release") {
      orderPlan = await releaseOrderInventory({
        orderPlanId: orderPlan.id,
        actor,
        note: "Admin cancelled order and released inventory",
        setOrderStatus: "cancelled",
        setPaymentStatus:
          orderPlan.payment?.status === "pending" ? "cancelled" : orderPlan.payment?.status,
      });
    } else if (action === "retry_commit") {
      orderPlan =
        orderPlan.mode === "recurring"
          ? await syncRecurringOrderInventory({
              orderPlanId: orderPlan.id,
              paidCycles: orderPlan.payment?.paidCount || 0,
              actor,
            })
          : await commitOneTimeOrderInventory({
              orderPlanId: orderPlan.id,
              actor,
              note: "Admin retried inventory commitment",
            });
    } else {
      return NextResponse.json({ error: "Unsupported inventory action." }, { status: 400 });
    }

    return NextResponse.json({
      orderPlan: serialize(orderPlan),
      inventory: getOrderInventorySummary(orderPlan),
    });
  } catch (actionError) {
    const status = [
      "INSUFFICIENT_INVENTORY",
      "INVALID_INVENTORY_ACTION",
      "INVENTORY_STATE_CONFLICT",
    ].includes(actionError.code)
      ? 409
      : 400;
    return NextResponse.json(
      { error: actionError.message || "Could not update order inventory." },
      { status }
    );
  }
}
