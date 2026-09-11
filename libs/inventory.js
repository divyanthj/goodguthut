import mongoose from "mongoose";
import {
  formatInventoryBatchCode,
  parseInventoryBatchCode,
} from "@/libs/inventory-batch-codes";
import InventoryBatch from "@/models/InventoryBatch";
import InventoryMovement from "@/models/InventoryMovement";
import OrderPlan from "@/models/OrderPlan";
import Sku from "@/models/Sku";

export const WEBSITE_INVENTORY_HOLD_MS = 30 * 60 * 1000;
export const LOW_STOCK_MAX = 3;

const ACTIVE_ALLOCATION_STATUSES = new Set([
  "held",
  "allocated",
  "partially_committed",
  "shortfall",
]);

export class InventoryError extends Error {
  constructor(message, code = "INVENTORY_ERROR", details = []) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.details = details;
  }
}

const integer = (value, minimum = 0) => {
  const normalized = Math.round(Number(value || 0));
  return Number.isFinite(normalized) ? Math.max(minimum, normalized) : minimum;
};

const normalizeSku = (value = "") => String(value || "").trim().toUpperCase();

const normalizeActor = (actor = {}) => ({
  actorType: ["system", "customer", "admin", "webhook"].includes(actor.actorType)
    ? actor.actorType
    : "system",
  actorEmail: String(actor.actorEmail || "").trim().toLowerCase(),
});

export const getSkuInventorySummary = (sku = {}) => {
  const tracked = sku.inventoryTrackingEnabled === true;
  const onHand = integer(sku.inventoryOnHand);
  const reserved = integer(sku.inventoryReserved);
  const rawAvailable = onHand - reserved;
  const available = tracked ? Math.max(0, rawAvailable) : null;
  const shortfall = tracked ? Math.max(0, -rawAvailable) : 0;
  const availability = !tracked
    ? "made_to_order"
    : available === 0
      ? "sold_out"
      : available <= LOW_STOCK_MAX
        ? "low_stock"
        : "available";

  return {
    inventoryTrackingEnabled: tracked,
    inventoryOnHand: onHand,
    inventoryReserved: reserved,
    inventoryAvailable: available,
    inventoryShortfall: shortfall,
    inventoryAvailability: availability,
  };
};

export const getOrderInventorySummary = (order = {}) => {
  const inventory = order.inventory?.toObject?.() || order.inventory || {};
  const items = Array.isArray(inventory.items) ? inventory.items : [];

  return {
    status: inventory.status || "not_tracked",
    channel: inventory.channel || "",
    expiresAt: inventory.expiresAt || null,
    totalCycles: integer(inventory.totalCycles, 1),
    committedCycles: integer(inventory.committedCycles),
    reservedQuantity: items.reduce(
      (sum, item) => sum + integer(item.reservedQuantity),
      0
    ),
    committedQuantity: items.reduce(
      (sum, item) => sum + integer(item.committedQuantity),
      0
    ),
    items,
    shortfalls: Array.isArray(inventory.shortfalls) ? inventory.shortfalls : [],
  };
};

const runTransaction = async (handler) => {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await handler(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const writeMovement = async ({
  session,
  sku,
  type,
  onHandDelta = 0,
  reservedDelta = 0,
  skuAfter,
  orderPlan,
  orderNumber = "",
  actor,
  note = "",
  idempotencyKey = "",
  batchAllocations = [],
}) => {
  const normalizedActor = normalizeActor(actor);

  await InventoryMovement.create(
    [
      {
        sku: normalizeSku(sku),
        type,
        onHandDelta,
        reservedDelta,
        onHandAfter: integer(skuAfter?.inventoryOnHand),
        reservedAfter: integer(skuAfter?.inventoryReserved),
        batchAllocations,
        orderPlan: orderPlan || null,
        orderNumber,
        ...normalizedActor,
        note: String(note || "").trim().slice(0, 500),
        idempotencyKey: String(idempotencyKey || "").trim(),
      },
    ],
    { session }
  );
};

const buildQuantityMap = (items = [], multiplier = 1) => {
  const quantities = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const sku = normalizeSku(item?.sku);
    const quantity = integer(item?.quantity);

    if (!sku || quantity < 1) {
      continue;
    }

    quantities.set(sku, (quantities.get(sku) || 0) + quantity * multiplier);
  }

  return quantities;
};

const getTrackedRequirements = async ({ items, totalCycles = 1, session }) => {
  const cycles = integer(totalCycles, 1);
  const perCycle = buildQuantityMap(items, 1);
  const skuCodes = [...perCycle.keys()];

  if (!skuCodes.length) {
    return [];
  }

  const skuDocs = await Sku.find({ sku: { $in: skuCodes } }).session(session);
  const skuMap = new Map(skuDocs.map((sku) => [sku.sku, sku]));

  return skuCodes
    .sort()
    .map((sku) => {
      const skuDoc = skuMap.get(sku);
      if (!skuDoc?.inventoryTrackingEnabled) {
        return null;
      }

      const quantityPerCycle = integer(perCycle.get(sku), 1);
      return {
        sku,
        skuDoc,
        quantityPerCycle,
        requiredQuantity: quantityPerCycle * cycles,
      };
    })
    .filter(Boolean);
};

const availableExpression = {
  $subtract: [
    { $ifNull: ["$inventoryOnHand", 0] },
    { $ifNull: ["$inventoryReserved", 0] },
  ],
};

const reserveRequirement = async ({ requirement, session }) =>
  Sku.findOneAndUpdate(
    {
      _id: requirement.skuDoc._id,
      inventoryTrackingEnabled: true,
      $expr: { $gte: [availableExpression, requirement.requiredQuantity] },
    },
    { $inc: { inventoryReserved: requirement.requiredQuantity } },
    { new: true, runValidators: true, session }
  );

const mergeCommittedBatchAllocations = (item, allocations = []) => {
  if (!Array.isArray(item.committedBatches)) {
    item.committedBatches = [];
  }

  for (const allocation of allocations) {
    const batchCode = String(allocation?.batchCode || "");
    const existing = item.committedBatches.find(
      (entry) => String(entry.batchCode || "") === batchCode
    );
    if (existing) {
      existing.quantity = integer(existing.quantity) + integer(allocation.quantity);
    } else {
      item.committedBatches.push(allocation);
    }
  }
};

const consumeInventoryBatchesInSession = async ({ skuDoc, quantity, session }) => {
  let remaining = integer(quantity);
  if (!remaining) {
    return [];
  }

  const batches = await InventoryBatch.find({
    sku: skuDoc._id,
    quantityRemaining: { $gt: 0 },
  })
    .sort({ year: 1, month: 1, sequence: 1, createdAt: 1 })
    .session(session);
  const batchedOnHand = batches.reduce(
    (total, batch) => total + integer(batch.quantityRemaining),
    0
  );
  const legacyUnbatched = Math.max(0, integer(skuDoc.inventoryOnHand) - batchedOnHand);
  const allocations = [];
  const legacyQuantity = Math.min(remaining, legacyUnbatched);

  if (legacyQuantity > 0) {
    allocations.push({ batch: null, batchCode: "", quantity: legacyQuantity });
    remaining -= legacyQuantity;
  }

  for (const batch of batches) {
    if (!remaining) break;
    const batchQuantity = Math.min(remaining, integer(batch.quantityRemaining));
    if (!batchQuantity) continue;

    const quantityAfter = integer(batch.quantityRemaining) - batchQuantity;
    const updatedBatch = await InventoryBatch.findOneAndUpdate(
      { _id: batch._id, quantityRemaining: { $gte: batchQuantity } },
      {
        $inc: { quantityRemaining: -batchQuantity },
        $set: { status: quantityAfter === 0 ? "depleted" : "active" },
      },
      { new: true, runValidators: true, session }
    );
    if (!updatedBatch) {
      throw new InventoryError(
        `Batch ${formatInventoryBatchCode(batch.batchCode)} changed during inventory commitment.`,
        "INVENTORY_STATE_CONFLICT"
      );
    }

    allocations.push({
      batch: updatedBatch._id,
      batchCode: updatedBatch.batchCode,
      quantity: batchQuantity,
    });
    remaining -= batchQuantity;
  }

  if (remaining > 0) {
    throw new InventoryError(
      `Batch balances for ${skuDoc.sku} do not match its on-hand inventory.`,
      "INVENTORY_STATE_CONFLICT"
    );
  }

  return allocations;
};

const consumeAvailableRequirement = async ({ requirement, session }) => {
  const updatedSku = await Sku.findOneAndUpdate(
    {
      _id: requirement.skuDoc._id,
      inventoryTrackingEnabled: true,
      $expr: { $gte: [availableExpression, requirement.requiredQuantity] },
    },
    { $inc: { inventoryOnHand: -requirement.requiredQuantity } },
    { new: true, runValidators: true, session }
  );

  if (!updatedSku) {
    return null;
  }

  const batchAllocations = await consumeInventoryBatchesInSession({
    skuDoc: requirement.skuDoc,
    quantity: requirement.requiredQuantity,
    session,
  });
  return { skuDoc: updatedSku, batchAllocations };
};

const throwInsufficientInventory = (requirements = []) => {
  throw new InventoryError(
    "One or more selected products no longer have enough stock. Please update the order and try again.",
    "INSUFFICIENT_INVENTORY",
    requirements.map((item) => ({ sku: item.sku, requiredQuantity: item.requiredQuantity }))
  );
};

export const createOrderPlanWithInventory = async ({
  orderPayload,
  channel = "website",
  totalCycles = 1,
  expiresAt = null,
  commitImmediately = false,
  actor = {},
}) => {
  await cleanupExpiredInventoryHolds();
  return runTransaction(async (session) => {
    const cycles = integer(totalCycles, 1);
    const orderPlanId = new mongoose.Types.ObjectId();
    const requirements = await getTrackedRequirements({
      items: orderPayload.items,
      totalCycles: cycles,
      session,
    });
    const allocationItems = [];

    for (const requirement of requirements) {
      const consumption = commitImmediately
        ? await consumeAvailableRequirement({ requirement, session })
        : null;
      const updatedSku = commitImmediately
        ? consumption?.skuDoc
        : await reserveRequirement({ requirement, session });
      const batchAllocations = consumption?.batchAllocations || [];

      if (!updatedSku) {
        throwInsufficientInventory([requirement]);
      }

      allocationItems.push({
        sku: requirement.sku,
        quantityPerCycle: requirement.quantityPerCycle,
        reservedQuantity: commitImmediately ? 0 : requirement.requiredQuantity,
        committedQuantity: commitImmediately ? requirement.requiredQuantity : 0,
        committedBatches: commitImmediately ? batchAllocations : [],
      });

      await writeMovement({
        session,
        sku: requirement.sku,
        type: commitImmediately ? "sale_committed" : "reservation_created",
        onHandDelta: commitImmediately ? -requirement.requiredQuantity : 0,
        reservedDelta: commitImmediately ? 0 : requirement.requiredQuantity,
        skuAfter: updatedSku,
        orderPlan: orderPlanId,
        orderNumber: orderPayload.orderNumber || "",
        actor,
        note: commitImmediately ? "Order committed when created" : "Order stock held",
        batchAllocations,
      });
    }

    const inventory = requirements.length
      ? {
          status: commitImmediately ? "committed" : "held",
          channel,
          expiresAt: commitImmediately ? null : expiresAt,
          totalCycles: cycles,
          committedCycles: commitImmediately ? cycles : 0,
          items: allocationItems,
          shortfalls: [],
          lastTransitionAt: new Date(),
        }
      : {
          status: "not_tracked",
          channel,
          expiresAt: null,
          totalCycles: cycles,
          committedCycles: 0,
          items: [],
          shortfalls: [],
          lastTransitionAt: new Date(),
        };

    const [orderPlan] = await OrderPlan.create(
      [{ ...orderPayload, _id: orderPlanId, inventory }],
      { session }
    );

    return orderPlan;
  });
};

const releaseAllocationInSession = async ({
  orderPlan,
  session,
  expired = false,
  actor = {},
  note = "",
  setOrderStatus = "",
  setPaymentStatus = "",
}) => {
  const inventory = orderPlan.inventory;
  const currentStatus = inventory?.status || "not_tracked";

  if (!ACTIVE_ALLOCATION_STATUSES.has(currentStatus)) {
    if (setOrderStatus || setPaymentStatus) {
      if (setOrderStatus) orderPlan.status = setOrderStatus;
      if (setPaymentStatus) orderPlan.payment.status = setPaymentStatus;
      await orderPlan.save({ session });
    }
    return orderPlan;
  }

  for (const item of inventory.items || []) {
    const quantity = integer(item.reservedQuantity);
    if (!quantity) {
      continue;
    }

    const updatedSku = await Sku.findOneAndUpdate(
      {
        sku: normalizeSku(item.sku),
        inventoryReserved: { $gte: quantity },
      },
      { $inc: { inventoryReserved: -quantity } },
      { new: true, runValidators: true, session }
    );

    if (!updatedSku) {
      throw new InventoryError(
        `Inventory reservation for ${item.sku} is inconsistent.`,
        "INVENTORY_STATE_CONFLICT"
      );
    }

    item.reservedQuantity = 0;
    await writeMovement({
      session,
      sku: item.sku,
      type: expired ? "reservation_expired" : "reservation_released",
      reservedDelta: -quantity,
      skuAfter: updatedSku,
      orderPlan: orderPlan._id,
      orderNumber: orderPlan.orderNumber || "",
      actor,
      note: note || (expired ? "Website hold expired" : "Order allocation released"),
    });
  }

  inventory.status = expired ? "expired" : "released";
  inventory.expiresAt = null;
  inventory.shortfalls = [];
  inventory.lastTransitionAt = new Date();
  if (setOrderStatus) {
    orderPlan.status = setOrderStatus;
  }
  if (setPaymentStatus) {
    orderPlan.payment.status = setPaymentStatus;
  }
  await orderPlan.save({ session });
  return orderPlan;
};

export const releaseOrderInventory = async ({
  orderPlanId,
  expired = false,
  actor = {},
  note = "",
  setOrderStatus = "",
  setPaymentStatus = "",
}) =>
  runTransaction(async (session) => {
    const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
    if (!orderPlan) {
      return null;
    }
    return releaseAllocationInSession({
      orderPlan,
      session,
      expired,
      actor,
      note,
      setOrderStatus,
      setPaymentStatus,
    });
  });

export const deleteOrderPlanWithInventory = async ({ orderPlanId, actor = {} }) =>
  runTransaction(async (session) => {
    const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
    if (!orderPlan) {
      return null;
    }

    await releaseAllocationInSession({
      orderPlan,
      session,
      actor,
      note: "Order deleted by admin",
    });
    await OrderPlan.deleteOne({ _id: orderPlan._id }, { session });
    return orderPlan;
  });

const buildShortfalls = async ({ orderPlan, quantities, session }) => {
  const skuCodes = [...quantities.keys()];
  const skus = await Sku.find({ sku: { $in: skuCodes } }).session(session);
  const skuMap = new Map(skus.map((sku) => [sku.sku, sku]));

  return skuCodes
    .map((sku) => {
      const requiredQuantity = integer(quantities.get(sku));
      const skuDoc = skuMap.get(sku);
      if (!skuDoc?.inventoryTrackingEnabled) {
        return null;
      }
      const summary = getSkuInventorySummary(skuDoc);
      const allocationItem = (orderPlan.inventory?.items || []).find(
        (item) => item.sku === sku
      );
      const heldForOrder = integer(allocationItem?.reservedQuantity);
      const usable = heldForOrder + integer(summary.inventoryAvailable);

      return usable < requiredQuantity
        ? {
            sku,
            requiredQuantity,
            availableQuantity: Math.max(0, usable),
          }
        : null;
    })
    .filter(Boolean);
};

const markShortfall = async ({ orderPlan, shortfalls, session, actor, note }) => {
  const wasShortfall = orderPlan.inventory?.status === "shortfall";
  orderPlan.inventory.status = "shortfall";
  orderPlan.inventory.shortfalls = shortfalls;
  orderPlan.inventory.expiresAt = null;
  orderPlan.inventory.lastTransitionAt = new Date();
  await orderPlan.save({ session });

  if (!wasShortfall) {
    for (const shortfall of shortfalls) {
      const skuDoc = await Sku.findOne({ sku: shortfall.sku }).session(session);
      if (skuDoc) {
        await writeMovement({
          session,
          sku: shortfall.sku,
          type: "shortfall_recorded",
          skuAfter: skuDoc,
          orderPlan: orderPlan._id,
          orderNumber: orderPlan.orderNumber || "",
          actor,
          note: note || "Paid order needs inventory attention",
        });
      }
    }
  }

  return orderPlan;
};

const recordShortfallAfterRollback = async ({
  orderPlanId,
  details = [],
  actor = {},
  note = "",
  markManualPaid = false,
}) =>
  runTransaction(async (session) => {
    const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
    if (!orderPlan) {
      return null;
    }

    if (markManualPaid) {
      orderPlan.payment.status = "paid";
      orderPlan.payment.paymentId = orderPlan.payment.paymentId || `manual_${Date.now()}`;
      orderPlan.payment.paidAt = orderPlan.payment.paidAt || new Date();
      orderPlan.status = "confirmed";
    }

    const quantities = new Map(
      details
        .map((item) => [normalizeSku(item?.sku), integer(item?.requiredQuantity)])
        .filter(([sku, quantity]) => sku && quantity > 0)
    );
    const calculated = quantities.size
      ? await buildShortfalls({ orderPlan, quantities, session })
      : [];
    const shortfalls = calculated.length
      ? calculated
      : [...quantities].map(([sku, requiredQuantity]) => ({
          sku,
          requiredQuantity,
          availableQuantity: 0,
        }));

    return markShortfall({
      orderPlan,
      shortfalls,
      session,
      actor,
      note,
    });
  });

const commitOneTimeInSession = async ({ orderPlan, session, actor = {}, note = "" }) => {
  if (orderPlan.mode !== "one_time") {
    return orderPlan;
  }
  const status = orderPlan.inventory?.status || "not_tracked";
  if (["not_tracked", "committed"].includes(status)) {
    return orderPlan;
  }

  const quantities = new Map();
  for (const item of orderPlan.inventory.items || []) {
    const remaining = Math.max(
      0,
      integer(item.quantityPerCycle) - integer(item.committedQuantity)
    );
    if (remaining) {
      quantities.set(item.sku, remaining);
    }
  }

  const shortfalls = await buildShortfalls({ orderPlan, quantities, session });
  if (shortfalls.length) {
    return markShortfall({ orderPlan, shortfalls, session, actor, note });
  }

  for (const item of orderPlan.inventory.items || []) {
    const requiredQuantity = integer(quantities.get(item.sku));
    if (!requiredQuantity) {
      continue;
    }

    const skuDoc = await Sku.findOne({ sku: item.sku }).session(session);
    if (!skuDoc?.inventoryTrackingEnabled) {
      item.committedQuantity += requiredQuantity;
      item.reservedQuantity = 0;
      continue;
    }

    const heldQuantity = Math.min(requiredQuantity, integer(item.reservedQuantity));
    const directQuantity = requiredQuantity - heldQuantity;
    const updatedSku = await Sku.findOneAndUpdate(
      {
        _id: skuDoc._id,
        inventoryOnHand: { $gte: requiredQuantity },
        inventoryReserved: { $gte: heldQuantity },
        ...(directQuantity
          ? { $expr: { $gte: [availableExpression, directQuantity] } }
          : {}),
      },
      {
        $inc: {
          inventoryOnHand: -requiredQuantity,
          inventoryReserved: -heldQuantity,
        },
      },
      { new: true, runValidators: true, session }
    );

    if (!updatedSku) {
      throw new InventoryError(
        "The paid order could not be committed because inventory changed.",
        "INVENTORY_COMMIT_SHORTFALL",
        [{ sku: item.sku, requiredQuantity }]
      );
    }

    const batchAllocations = await consumeInventoryBatchesInSession({
      skuDoc,
      quantity: requiredQuantity,
      session,
    });
    item.committedQuantity += requiredQuantity;
    item.reservedQuantity = Math.max(0, integer(item.reservedQuantity) - heldQuantity);
    mergeCommittedBatchAllocations(item, batchAllocations);
    await writeMovement({
      session,
      sku: item.sku,
      type: "sale_committed",
      onHandDelta: -requiredQuantity,
      reservedDelta: -heldQuantity,
      skuAfter: updatedSku,
      orderPlan: orderPlan._id,
      orderNumber: orderPlan.orderNumber || "",
      actor,
      note: note || "One-time order committed",
      batchAllocations,
    });
  }

  orderPlan.inventory.status = "committed";
  orderPlan.inventory.committedCycles = 1;
  orderPlan.inventory.shortfalls = [];
  orderPlan.inventory.expiresAt = null;
  orderPlan.inventory.lastTransitionAt = new Date();
  await orderPlan.save({ session });
  return orderPlan;
};

export const commitOneTimeOrderInventory = async ({
  orderPlanId,
  actor = {},
  note = "",
}) => {
  try {
    return await runTransaction(async (session) => {
      const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
      if (!orderPlan) {
        return null;
      }
      return commitOneTimeInSession({ orderPlan, session, actor, note });
    });
  } catch (error) {
    if (error.code !== "INVENTORY_COMMIT_SHORTFALL") {
      throw error;
    }
    return recordShortfallAfterRollback({
      orderPlanId,
      details: error.details,
      actor,
      note: note || "Paid order needs inventory attention",
    });
  }
};

export const markManualOrderPaid = async ({ orderPlanId, actor = {} }) => {
  try {
    return await runTransaction(async (session) => {
      const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
      if (!orderPlan) {
        return null;
      }
      if (
        orderPlan.mode !== "one_time" ||
        orderPlan.source !== "admin" ||
        orderPlan.payment?.provider !== "manual" ||
        orderPlan.payment?.status !== "pending"
      ) {
        throw new InventoryError(
          "Only unpaid admin orders can be marked paid here.",
          "INVALID_INVENTORY_ACTION"
        );
      }

      orderPlan.payment.status = "paid";
      orderPlan.payment.paymentId = orderPlan.payment.paymentId || `manual_${Date.now()}`;
      orderPlan.payment.paidAt = new Date();
      orderPlan.status = "confirmed";
      await orderPlan.save({ session });
      return commitOneTimeInSession({
        orderPlan,
        session,
        actor,
        note: "External payment confirmed by admin",
      });
    });
  } catch (error) {
    if (error.code !== "INVENTORY_COMMIT_SHORTFALL") {
      throw error;
    }
    return recordShortfallAfterRollback({
      orderPlanId,
      details: error.details,
      actor,
      note: "External payment confirmed but inventory needs attention",
      markManualPaid: true,
    });
  }
};

const ensureRecurringAllocationInSession = async ({ orderPlan, session, actor = {} }) => {
  const status = orderPlan.inventory?.status || "not_tracked";
  if (["not_tracked", "committed"].includes(status)) {
    return orderPlan;
  }
  if (["held", "allocated", "partially_committed"].includes(status)) {
    orderPlan.inventory.status =
      integer(orderPlan.inventory.committedCycles) > 0
        ? "partially_committed"
        : "allocated";
    orderPlan.inventory.expiresAt = null;
    orderPlan.inventory.shortfalls = [];
    orderPlan.inventory.lastTransitionAt = new Date();
    await orderPlan.save({ session });
    return orderPlan;
  }

  const requirements = [];
  for (const item of orderPlan.inventory.items || []) {
    const totalRequired =
      integer(item.quantityPerCycle, 1) * integer(orderPlan.inventory.totalCycles, 1);
    const remaining = Math.max(
      0,
      totalRequired -
        integer(item.committedQuantity) -
        integer(item.reservedQuantity)
    );
    if (remaining) {
      const skuDoc = await Sku.findOne({ sku: item.sku }).session(session);
      if (skuDoc?.inventoryTrackingEnabled) {
        requirements.push({
          sku: item.sku,
          skuDoc,
          quantityPerCycle: integer(item.quantityPerCycle, 1),
          requiredQuantity: remaining,
        });
      }
    }
  }

  const shortages = [];
  for (const requirement of requirements) {
    const updatedSku = await reserveRequirement({ requirement, session });
    if (!updatedSku) {
      const summary = getSkuInventorySummary(requirement.skuDoc);
      shortages.push({
        sku: requirement.sku,
        requiredQuantity: requirement.requiredQuantity,
        availableQuantity: integer(summary.inventoryAvailable),
      });
      continue;
    }

    const allocationItem = orderPlan.inventory.items.find(
      (item) => item.sku === requirement.sku
    );
    allocationItem.reservedQuantity =
      integer(allocationItem.reservedQuantity) + requirement.requiredQuantity;
    await writeMovement({
      session,
      sku: requirement.sku,
      type: "reservation_created",
      reservedDelta: requirement.requiredQuantity,
      skuAfter: updatedSku,
      orderPlan: orderPlan._id,
      orderNumber: orderPlan.orderNumber || "",
      actor,
      note: "Recurring allocation reacquired after payment setup",
    });
  }

  if (shortages.length) {
    throwInsufficientInventory(shortages);
  }

  orderPlan.inventory.status =
    integer(orderPlan.inventory.committedCycles) > 0
      ? "partially_committed"
      : "allocated";
  orderPlan.inventory.expiresAt = null;
  orderPlan.inventory.shortfalls = [];
  orderPlan.inventory.lastTransitionAt = new Date();
  await orderPlan.save({ session });
  return orderPlan;
};

export const activateRecurringOrderInventory = async ({ orderPlanId, actor = {} }) => {
  try {
    return await runTransaction(async (session) => {
      const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
      if (!orderPlan) {
        return null;
      }
      return ensureRecurringAllocationInSession({ orderPlan, session, actor });
    });
  } catch (error) {
    if (error.code !== "INSUFFICIENT_INVENTORY") {
      throw error;
    }
    return recordShortfallAfterRollback({
      orderPlanId,
      details: error.details,
      actor,
      note: "Recurring payment setup completed after stock was released",
    });
  }
};

export const syncRecurringOrderInventory = async ({
  orderPlanId,
  paidCycles,
  actor = {},
}) => {
  try {
    return await runTransaction(async (session) => {
      const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
      if (!orderPlan) {
        return null;
      }
      if (orderPlan.inventory?.status === "not_tracked") {
        return orderPlan;
      }

      await ensureRecurringAllocationInSession({ orderPlan, session, actor });
      const totalCycles = integer(orderPlan.inventory.totalCycles, 1);
      const targetCycles = Math.min(totalCycles, integer(paidCycles));
      const committedCycles = integer(orderPlan.inventory.committedCycles);
      const cyclesToCommit = Math.max(0, targetCycles - committedCycles);

      if (!cyclesToCommit) {
        return orderPlan;
      }

      const quantities = new Map(
        (orderPlan.inventory.items || []).map((item) => [
          item.sku,
          integer(item.quantityPerCycle, 1) * cyclesToCommit,
        ])
      );
      const shortfalls = await buildShortfalls({ orderPlan, quantities, session });
      if (shortfalls.length) {
        return markShortfall({
          orderPlan,
          shortfalls,
          session,
          actor,
          note: "Recurring charge needs inventory attention",
        });
      }

      for (const item of orderPlan.inventory.items || []) {
        const quantity = integer(item.quantityPerCycle, 1) * cyclesToCommit;
        const skuDoc = await Sku.findOne({ sku: item.sku }).session(session);
        if (!skuDoc?.inventoryTrackingEnabled) {
          item.committedQuantity += quantity;
          item.reservedQuantity = Math.max(0, integer(item.reservedQuantity) - quantity);
          continue;
        }

        const updatedSku = await Sku.findOneAndUpdate(
          {
            _id: skuDoc._id,
            inventoryOnHand: { $gte: quantity },
            inventoryReserved: { $gte: quantity },
          },
          {
            $inc: {
              inventoryOnHand: -quantity,
              inventoryReserved: -quantity,
            },
          },
          { new: true, runValidators: true, session }
        );

        if (!updatedSku) {
          throw new InventoryError(
            "The recurring charge could not be committed because inventory changed.",
            "INVENTORY_COMMIT_SHORTFALL",
            [{ sku: item.sku, requiredQuantity: quantity }]
          );
        }

        const batchAllocations = await consumeInventoryBatchesInSession({
          skuDoc,
          quantity,
          session,
        });
        item.committedQuantity += quantity;
        item.reservedQuantity = Math.max(0, integer(item.reservedQuantity) - quantity);
        mergeCommittedBatchAllocations(item, batchAllocations);
        await writeMovement({
          session,
          sku: item.sku,
          type: "recurring_cycle_committed",
          onHandDelta: -quantity,
          reservedDelta: -quantity,
          skuAfter: updatedSku,
          orderPlan: orderPlan._id,
          orderNumber: orderPlan.orderNumber || "",
          actor,
          note: `${cyclesToCommit} recurring cycle${cyclesToCommit === 1 ? "" : "s"} committed`,
          batchAllocations,
        });
      }

      orderPlan.inventory.committedCycles = targetCycles;
      orderPlan.inventory.status =
        targetCycles >= totalCycles ? "committed" : "partially_committed";
      orderPlan.inventory.shortfalls = [];
      orderPlan.inventory.expiresAt = null;
      orderPlan.inventory.lastTransitionAt = new Date();
      await orderPlan.save({ session });
      return orderPlan;
    });
  } catch (error) {
    if (!["INSUFFICIENT_INVENTORY", "INVENTORY_COMMIT_SHORTFALL"].includes(error.code)) {
      throw error;
    }
    return recordShortfallAfterRollback({
      orderPlanId,
      details: error.details,
      actor,
      note: "Recurring charge needs inventory attention",
    });
  }
};

export const replaceManualOrderItems = async ({
  orderPlanId,
  items,
  pricing = {},
  actor = {},
}) =>
  runTransaction(async (session) => {
    const orderPlan = await OrderPlan.findById(orderPlanId).session(session);
    if (!orderPlan) {
      return null;
    }
    if (
      orderPlan.mode !== "one_time" ||
      orderPlan.source !== "admin" ||
      orderPlan.payment?.provider !== "manual" ||
      orderPlan.payment?.status !== "pending"
    ) {
      throw new InventoryError(
        "Only unpaid admin orders can be edited.",
        "INVALID_INVENTORY_ACTION"
      );
    }

    const nextRequirements = await getTrackedRequirements({
      items,
      totalCycles: 1,
      session,
    });
    const nextMap = new Map(nextRequirements.map((item) => [item.sku, item]));
    const currentMap = new Map(
      (orderPlan.inventory?.items || []).map((item) => [
        item.sku,
        integer(item.reservedQuantity),
      ])
    );
    const skuCodes = [...new Set([...nextMap.keys(), ...currentMap.keys()])].sort();

    for (const sku of skuCodes) {
      const nextQuantity = integer(nextMap.get(sku)?.requiredQuantity);
      const currentQuantity = integer(currentMap.get(sku));
      const delta = nextQuantity - currentQuantity;
      if (!delta) {
        continue;
      }

      let updatedSku;
      if (delta > 0) {
        const requirement = nextMap.get(sku);
        updatedSku = await reserveRequirement({
          requirement: { ...requirement, requiredQuantity: delta },
          session,
        });
        if (!updatedSku) {
          throwInsufficientInventory([{ ...requirement, requiredQuantity: delta }]);
        }
      } else {
        updatedSku = await Sku.findOneAndUpdate(
          { sku, inventoryReserved: { $gte: Math.abs(delta) } },
          { $inc: { inventoryReserved: delta } },
          { new: true, runValidators: true, session }
        );
        if (!updatedSku) {
          throw new InventoryError(
            `Inventory reservation for ${sku} is inconsistent.`,
            "INVENTORY_STATE_CONFLICT"
          );
        }
      }

      await writeMovement({
        session,
        sku,
        type: "reservation_adjusted",
        reservedDelta: delta,
        skuAfter: updatedSku,
        orderPlan: orderPlan._id,
        orderNumber: orderPlan.orderNumber || "",
        actor,
        note: "Unpaid admin order edited",
      });
    }

    orderPlan.items = items;
    orderPlan.totalQuantity = pricing.totalQuantity;
    orderPlan.subtotal = pricing.subtotal;
    orderPlan.smallCartFee = pricing.smallCartFee;
    orderPlan.discount = pricing.discount;
    orderPlan.total = pricing.total;
    orderPlan.payment.amount = pricing.total;
    orderPlan.inventory = nextRequirements.length
      ? {
          status: "held",
          channel: "admin",
          expiresAt: null,
          totalCycles: 1,
          committedCycles: 0,
          items: nextRequirements.map((item) => ({
            sku: item.sku,
            quantityPerCycle: item.quantityPerCycle,
            reservedQuantity: item.requiredQuantity,
            committedQuantity: 0,
          })),
          shortfalls: [],
          lastTransitionAt: new Date(),
        }
      : {
          status: "not_tracked",
          channel: "admin",
          expiresAt: null,
          totalCycles: 1,
          committedCycles: 0,
          items: [],
          shortfalls: [],
          lastTransitionAt: new Date(),
        };
    await orderPlan.save({ session });
    return orderPlan;
  });

export const updateSkuInventory = async ({
  skuId,
  action,
  onHand,
  batchCode,
  quantity,
  note = "",
  actor = {},
}) =>
  runTransaction(async (session) => {
    const sku = await Sku.findById(skuId).session(session);
    if (!sku) {
      return null;
    }

    if (action === "disable") {
      if (integer(sku.inventoryReserved) > 0) {
        throw new InventoryError(
          "Release or commit every active allocation before disabling inventory tracking.",
          "ACTIVE_INVENTORY_ALLOCATIONS"
        );
      }
      sku.inventoryTrackingEnabled = false;
      await sku.save({ session });
      await writeMovement({
        session,
        sku: sku.sku,
        type: "tracking_disabled",
        skuAfter: sku,
        actor,
        note: note || "Inventory tracking disabled",
      });
      return sku;
    }

    if (action === "add_batch") {
      if (!sku.inventoryTrackingEnabled) {
        throw new InventoryError(
          "Enable inventory tracking before adding a batch.",
          "INVENTORY_NOT_ENABLED"
        );
      }

      const parsedBatch = parseInventoryBatchCode(batchCode);
      if (!parsedBatch) {
        throw new InventoryError(
          "Enter a batch number in the format SSSS-YY-MM-NN.",
          "INVALID_BATCH_CODE"
        );
      }
      const batchQuantity = Number(quantity);
      if (!Number.isInteger(batchQuantity) || batchQuantity < 1) {
        throw new InventoryError(
          "Batch quantity must be a whole number greater than zero.",
          "INVALID_BATCH_QUANTITY"
        );
      }
      if (
        sku.inventoryBatchPrefix &&
        sku.inventoryBatchPrefix !== parsedBatch.prefix
      ) {
        throw new InventoryError(
          `This SKU uses the ${sku.inventoryBatchPrefix} batch prefix.`,
          "BATCH_PREFIX_MISMATCH"
        );
      }
      const duplicateBatch = await InventoryBatch.exists({
        batchCode: parsedBatch.canonical,
      }).session(session);
      if (duplicateBatch) {
        throw new InventoryError(
          `Batch ${formatInventoryBatchCode(parsedBatch.canonical)} already exists.`,
          "DUPLICATE_BATCH_CODE"
        );
      }

      let batch;
      try {
        [batch] = await InventoryBatch.create(
          [
            {
              sku: sku._id,
              skuCode: sku.sku,
              batchCode: parsedBatch.canonical,
              prefix: parsedBatch.prefix,
              year: parsedBatch.year,
              month: parsedBatch.month,
              sequence: parsedBatch.sequence,
              quantityReceived: batchQuantity,
              quantityRemaining: batchQuantity,
              status: "active",
              note: String(note || "").trim(),
              createdByAdmin: normalizeActor(actor).actorEmail,
            },
          ],
          { session }
        );
      } catch (error) {
        if (error?.code === 11000) {
          throw new InventoryError(
            `Batch ${formatInventoryBatchCode(parsedBatch.canonical)} already exists.`,
            "DUPLICATE_BATCH_CODE"
          );
        }
        throw error;
      }
      sku.inventoryBatchPrefix = sku.inventoryBatchPrefix || parsedBatch.prefix;
      sku.inventoryOnHand = integer(sku.inventoryOnHand) + batchQuantity;
      await sku.save({ session });
      await writeMovement({
        session,
        sku: sku.sku,
        type: "batch_added",
        onHandDelta: batchQuantity,
        skuAfter: sku,
        actor,
        note: note || `Added batch ${formatInventoryBatchCode(batch.batchCode)}`,
        batchAllocations: [
          { batch: batch._id, batchCode: batch.batchCode, quantity: batchQuantity },
        ],
      });
      return sku;
    }

    if (!["enable", "set_on_hand"].includes(action)) {
      throw new InventoryError("Unsupported inventory action.", "INVALID_INVENTORY_ACTION");
    }

    const previousOnHand = integer(sku.inventoryOnHand);
    if (action === "set_on_hand" && !sku.inventoryTrackingEnabled) {
      throw new InventoryError(
        "Enable inventory tracking before adjusting stock.",
        "INVENTORY_NOT_ENABLED"
      );
    }

    sku.inventoryTrackingEnabled = true;
    if (action === "enable") {
      await sku.save({ session });
      await writeMovement({
        session,
        sku: sku.sku,
        type: "opening_balance",
        skuAfter: sku,
        actor,
        note: note || "Inventory tracking enabled",
      });
      return sku;
    }

    const nextOnHand = integer(onHand);
    if (nextOnHand > previousOnHand) {
      throw new InventoryError(
        "Add new stock as a batch instead of increasing physical on-hand directly.",
        "BATCH_REQUIRED_FOR_INCREASE"
      );
    }
    const reduction = previousOnHand - nextOnHand;
    const batchAllocations = reduction
      ? await consumeInventoryBatchesInSession({ skuDoc: sku, quantity: reduction, session })
      : [];
    sku.inventoryOnHand = nextOnHand;
    await sku.save({ session });
    await writeMovement({
      session,
      sku: sku.sku,
      type: batchAllocations.some((item) => item.batchCode)
        ? "batch_adjusted"
        : "manual_adjustment",
      onHandDelta: nextOnHand - previousOnHand,
      skuAfter: sku,
      actor,
      note: note || "Admin stocktake",
      batchAllocations,
    });
    return sku;
  });

export const listSkuInventoryBatches = async ({ skuId, limit = 100 }) => {
  const batches = await InventoryBatch.find({ sku: skuId })
    .sort({ year: -1, month: -1, sequence: -1, createdAt: -1 })
    .limit(Math.min(250, Math.max(1, integer(limit, 1))));

  return batches.map((batch) => ({
    ...(batch.toJSON?.() || batch.toObject?.() || batch),
    displayBatchCode: formatInventoryBatchCode(batch.batchCode),
  }));
};

export const getSkuInventoryBatchSummary = async ({ sku }) => {
  const [totals] = await InventoryBatch.aggregate([
    { $match: { sku: sku._id } },
    { $group: { _id: null, batchedOnHand: { $sum: "$quantityRemaining" } } },
  ]);
  const batchedOnHand = integer(totals?.batchedOnHand);
  return {
    batchedOnHand,
    legacyUnbatchedOnHand: Math.max(0, integer(sku?.inventoryOnHand) - batchedOnHand),
  };
};

export const listSkuInventoryMovements = async ({ sku, limit = 50 }) =>
  InventoryMovement.find({ sku: normalizeSku(sku) })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, integer(limit, 1))));

export const cleanupExpiredInventoryHolds = async ({ limit = 100 } = {}) => {
  const expiredOrders = await OrderPlan.find({
    "inventory.status": "held",
    "inventory.expiresAt": { $ne: null, $lte: new Date() },
  })
    .select("_id")
    .sort({ "inventory.expiresAt": 1 })
    .limit(Math.min(500, Math.max(1, integer(limit, 1))))
    .lean();

  let released = 0;
  for (const order of expiredOrders) {
    try {
      const result = await releaseOrderInventory({
        orderPlanId: order._id,
        expired: true,
        actor: { actorType: "system" },
        note: "Thirty-minute website inventory hold expired",
      });
      if (result) {
        released += 1;
      }
    } catch (error) {
      console.error("Failed to release expired inventory hold", order._id, error);
    }
  }

  return released;
};

export const canFulfillOrderInventory = (orderPlan = {}) =>
  !["held", "shortfall"].includes(orderPlan.inventory?.status || "not_tracked");
