#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const repoRoot = path.resolve(__dirname, "..");
const envPath = path.join(repoRoot, ".env.local");

if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const mongoUri = process.env.MONGODB_DIRECT_URI || process.env.MONGODB_URI;
const collatoBaseUrl = String(process.env.COLLATO_INTERNAL_API_URL || "").replace(/\/$/, "");
const collatoSecret = process.env.COLLATO_INTERNAL_API_SECRET || "";
const tenantSlug = process.env.COLLATO_TENANT_SLUG || "ggh";
const sourceApp = "ggh-code";

const sourceConfigs = [
  { collection: "orderplans", sourceType: "order_plan", title: (item) => `Order plan ${item.orderNumber || item.name || item._id}` },
  { collection: "preorders", sourceType: "preorder", title: (item) => `Preorder ${item.orderNumber || item.customerName || item._id}` },
  { collection: "subscriptions", sourceType: "subscription", title: (item) => `Subscription ${item.name || item.email || item._id}` },
  { collection: "recipeformulas", sourceType: "recipe", title: (item) => `Recipe ${item.skuName || item.sku || item._id} v${item.version || 1}` },
  { collection: "invoices", sourceType: "invoice", title: (item) => `Invoice ${item.invoiceNumber || item._id}` },
  { collection: "discountcodes", sourceType: "discount_code", title: (item) => `Discount ${item.code || item._id}` },
  { collection: "skus", sourceType: "sku", title: (item) => `SKU ${item.sku || item.name || item._id}` },
  { collection: "subscriptionsettings", sourceType: "subscription_settings", title: () => "Subscription settings" },
];

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

async function upsertSource({ sourceType, item, title }) {
  const id = String(item._id || item.id);
  const sourceId = `ggh:${sourceType}:${id}`;
  const response = await fetch(`${collatoBaseUrl}/api/internal/knowledge/sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-collato-internal-secret": collatoSecret,
    },
    body: JSON.stringify({
      tenantSlug,
      sourceApp,
      sourceType,
      sourceId,
      title,
      text: JSON.stringify(
        {
          title,
          sourceType,
          sourceId,
          data: jsonSafe(item),
        },
        null,
        2
      ),
      metadata: {
        sourceType,
        localId: id,
      },
      createdAt: item.createdAt || new Date(),
      updatedAt: item.updatedAt || new Date(),
    }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `Collato responded with ${response.status}`);
  }
}

async function main() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI or MONGODB_DIRECT_URI is required.");
  }

  if (!collatoBaseUrl || !collatoSecret) {
    throw new Error("COLLATO_INTERNAL_API_URL and COLLATO_INTERNAL_API_SECRET are required.");
  }

  const client = new MongoClient(mongoUri);
  await client.connect();

  try {
    const db = client.db();
    let synced = 0;
    let failed = 0;

    for (const config of sourceConfigs) {
      const docs = await db
        .collection(config.collection)
        .find({})
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(500)
        .toArray();

      for (const item of docs) {
        try {
          await upsertSource({
            sourceType: config.sourceType,
            item,
            title: config.title(item),
          });
          synced += 1;
        } catch (error) {
          failed += 1;
          console.error(`Failed to sync ${config.sourceType}:${item._id}: ${error.message}`);
        }
      }
    }

    console.log(`Collato knowledge backfill complete: ${synced} synced, ${failed} failed.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
