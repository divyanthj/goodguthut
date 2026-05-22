import connectMongo from "@/libs/mongoose";
import { syncCollatoKnowledgeDocument } from "@/libs/collato-knowledge";
import DiscountCode from "@/models/DiscountCode";
import Invoice from "@/models/Invoice";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import RecipeFormula from "@/models/RecipeFormula";
import Sku from "@/models/Sku";
import Subscription from "@/models/Subscription";
import SubscriptionSettings from "@/models/SubscriptionSettings";

const toJson = (doc) => (typeof doc?.toJSON === "function" ? doc.toJSON() : JSON.parse(JSON.stringify(doc)));

async function syncMany({ sourceType, titleFor, docs }) {
  let synced = 0;
  let failed = 0;

  for (const doc of docs) {
    const data = toJson(doc);
    const result = await syncCollatoKnowledgeDocument({
      sourceType,
      id: data.id || data._id,
      title: titleFor(data),
      data,
    });

    if (result?.error) {
      failed += 1;
    } else {
      synced += 1;
    }
  }

  return { synced, failed };
}

export async function backfillGghKnowledge() {
  await connectMongo();

  const [
    orderPlans,
    preorders,
    subscriptions,
    recipes,
    invoices,
    discounts,
    skus,
    settings,
  ] = await Promise.all([
    OrderPlan.find({}).sort({ createdAt: -1 }).limit(500),
    Preorder.find({}).sort({ createdAt: -1 }).limit(500),
    Subscription.find({}).sort({ createdAt: -1 }).limit(500),
    RecipeFormula.find({}).sort({ sku: 1, version: -1 }).limit(500),
    Invoice.find({}).sort({ createdAt: -1 }).limit(500),
    DiscountCode.find({}).sort({ updatedAt: -1 }).limit(200),
    Sku.find({}).sort({ sku: 1 }).limit(300),
    SubscriptionSettings.find({}).sort({ updatedAt: -1 }).limit(5),
  ]);

  const batches = [
    await syncMany({
      sourceType: "order_plan",
      docs: orderPlans,
      titleFor: (item) => `Order plan ${item.orderNumber || item.name || item.id}`,
    }),
    await syncMany({
      sourceType: "preorder",
      docs: preorders,
      titleFor: (item) => `Preorder ${item.orderNumber || item.customerName || item.id}`,
    }),
    await syncMany({
      sourceType: "subscription",
      docs: subscriptions,
      titleFor: (item) => `Subscription ${item.name || item.email || item.id}`,
    }),
    await syncMany({
      sourceType: "recipe",
      docs: recipes,
      titleFor: (item) => `Recipe ${item.skuName || item.sku} v${item.version || 1}`,
    }),
    await syncMany({
      sourceType: "invoice",
      docs: invoices,
      titleFor: (item) => `Invoice ${item.invoiceNumber || item.id}`,
    }),
    await syncMany({
      sourceType: "discount_code",
      docs: discounts,
      titleFor: (item) => `Discount ${item.code || item.id}`,
    }),
    await syncMany({
      sourceType: "sku",
      docs: skus,
      titleFor: (item) => `SKU ${item.sku || item.name || item.id}`,
    }),
    await syncMany({
      sourceType: "subscription_settings",
      docs: settings,
      titleFor: () => "Subscription settings",
    }),
  ];

  return batches.reduce(
    (total, batch) => ({
      synced: total.synced + batch.synced,
      failed: total.failed + batch.failed,
    }),
    { synced: 0, failed: 0 }
  );
}
