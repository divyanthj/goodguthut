import { NextResponse } from "next/server";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import {
  cleanupExpiredInventoryHolds,
  getSkuInventoryBatchSummary,
  getSkuInventorySummary,
  listSkuInventoryBatches,
  listSkuInventoryMovements,
  updateSkuInventory,
} from "@/libs/inventory";
import Sku from "@/models/Sku";

const ensureAdmin = async () => {
  const { session, isAdmin } = await getAdminSessionState();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
};

const serialize = (value) => JSON.parse(JSON.stringify(value));

export async function GET(_req, { params }) {
  const { error } = await ensureAdmin();
  if (error) return error;

  await connectMongo();
  await cleanupExpiredInventoryHolds();
  const sku = await Sku.findById(params.id);
  if (!sku) {
    return NextResponse.json({ error: "SKU not found." }, { status: 404 });
  }
  const [movements, batches, batchSummary] = await Promise.all([
    listSkuInventoryMovements({ sku: sku.sku }),
    listSkuInventoryBatches({ skuId: sku._id }),
    getSkuInventoryBatchSummary({ sku }),
  ]);

  return NextResponse.json({
    sku: { ...serialize(sku), ...getSkuInventorySummary(sku) },
    movements: serialize(movements),
    batches: serialize(batches),
    batchSummary,
  });
}

export async function PATCH(req, { params }) {
  const { session, error } = await ensureAdmin();
  if (error) return error;

  await connectMongo();
  await cleanupExpiredInventoryHolds();

  try {
    const body = await req.json();
    const action = String(body?.action || "").trim();
    const sku = await updateSkuInventory({
      skuId: params.id,
      action,
      onHand: body?.onHand,
      batchCode: body?.batchCode,
      quantity: body?.quantity,
      note: body?.note,
      actor: {
        actorType: "admin",
        actorEmail: session.user.email || "",
      },
    });

    if (!sku) {
      return NextResponse.json({ error: "SKU not found." }, { status: 404 });
    }

    const [movements, batches, batchSummary] = await Promise.all([
      listSkuInventoryMovements({ sku: sku.sku }),
      listSkuInventoryBatches({ skuId: sku._id }),
      getSkuInventoryBatchSummary({ sku }),
    ]);
    return NextResponse.json({
      sku: { ...serialize(sku), ...getSkuInventorySummary(sku) },
      movements: serialize(movements),
      batches: serialize(batches),
      batchSummary,
    });
  } catch (error) {
    const status = [
      "ACTIVE_INVENTORY_ALLOCATIONS",
      "INVENTORY_NOT_ENABLED",
      "BATCH_PREFIX_MISMATCH",
      "DUPLICATE_BATCH_CODE",
      "BATCH_REQUIRED_FOR_INCREASE",
    ].includes(error.code)
      ? 409
      : 400;
    return NextResponse.json(
      { error: error.message || "Could not update inventory." },
      { status }
    );
  }
}
