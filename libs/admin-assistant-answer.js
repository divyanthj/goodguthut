import { isCollatoKnowledgeConfigured, queryCollatoKnowledge } from "@/libs/collato-knowledge";
import { listCustomersFromOrders } from "@/libs/customer-nudges";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import AssistantEntry from "@/models/AssistantEntry";
import Invoice from "@/models/Invoice";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import RecipeFormula from "@/models/RecipeFormula";
import Sku from "@/models/Sku";
import Subscription from "@/models/Subscription";

export const ADMIN_CHAT_MODEL = process.env.OPENAI_ADMIN_CHAT_MODEL || "gpt-5.6-sol";

const answerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "tables", "charts", "widgets", "maps", "actions"],
  properties: {
    answer: { type: "string" },
    tables: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "columns", "rows"],
        properties: {
          title: { type: "string" },
          columns: { type: "array", items: { type: "string" }, maxItems: 10 },
          rows: {
            type: "array",
            maxItems: 500,
            items: { type: "array", items: { type: "string" }, maxItems: 10 },
          },
        },
      },
    },
    charts: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "xLabel", "yLabel", "labels", "series"],
        properties: {
          type: { type: "string", enum: ["bar", "line", "area", "pie", "donut"] },
          title: { type: "string" },
          xLabel: { type: "string" },
          yLabel: { type: "string" },
          labels: { type: "array", items: { type: "string" }, maxItems: 20 },
          series: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "values"],
              properties: {
                name: { type: "string" },
                values: { type: "array", items: { type: "number" }, maxItems: 20 },
              },
            },
          },
        },
      },
    },
    widgets: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "items"],
        properties: {
          type: { type: "string", enum: ["metrics", "status", "progress", "timeline", "comparison"] },
          title: { type: "string" },
          items: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "value", "detail", "status", "progress"],
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                detail: { type: "string" },
                status: { type: "string", enum: ["neutral", "info", "success", "warning", "error"] },
                progress: { type: "number", minimum: 0, maximum: 100 },
              },
            },
          },
        },
      },
    },
    maps: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "markers"],
        properties: {
          title: { type: "string" },
          markers: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "address"],
              properties: {
                label: { type: "string" },
                address: { type: "string" },
              },
            },
          },
        },
      },
    },
    actions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type", "target", "expectedStatus", "requestedStatus", "summary",
          "orderKind", "customerName", "phone", "email", "address", "deliveryDate",
          "paymentHandling", "items"
        ],
        properties: {
          type: {
            type: "string",
            enum: ["update_preorder_status", "update_order_plan_status", "update_sku_status", "create_manual_order"],
          },
          target: { type: "string" },
          expectedStatus: { type: "string" },
          requestedStatus: { type: "string" },
          summary: { type: "string" },
          orderKind: { type: "string", enum: ["", "manual", "sample"] },
          customerName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          address: { type: "string" },
          deliveryDate: { type: "string" },
          paymentHandling: { type: "string", enum: ["", "mark_paid", "collect_later", "never_collect"] },
          items: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sku", "quantity"],
              properties: {
                sku: { type: "string" },
                quantity: { type: "integer", minimum: 1, maximum: 10 },
              },
            },
          },
        },
      },
    },
  },
};

const ACTION_STATUSES = {
  update_preorder_status: new Set(["confirmed", "shipped", "delivered", "cancelled"]),
  update_order_plan_status: new Set(["confirmed", "shipped", "delivered", "cancelled", "active", "paused"]),
  update_sku_status: new Set(["active", "archived"]),
};

const normalizeProposedActions = (actions = []) =>
  actions.slice(0, 3).flatMap((action) => {
    if (action?.type === "create_manual_order") {
      const orderKind = action.orderKind === "sample" ? "sample" : "manual";
      const paymentHandling = orderKind === "sample"
        ? "never_collect"
        : ["mark_paid", "collect_later", "never_collect"].includes(action.paymentHandling)
          ? action.paymentHandling
          : "";
      const items = (Array.isArray(action.items) ? action.items : []).slice(0, 12).flatMap((item) => {
        const sku = String(item?.sku || "").trim().toUpperCase();
        const quantity = Math.round(Number(item?.quantity || 0));
        return sku && quantity > 0 && quantity <= 10 ? [{ sku, quantity }] : [];
      });
      const customerName = String(action.customerName || "").trim();
      const phone = String(action.phone || "").trim();
      const address = String(action.address || "").trim();
      const deliveryDate = String(action.deliveryDate || "").trim();
      if (
        !customerName ||
        (orderKind === "manual" && (!phone || !address)) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) ||
        !paymentHandling ||
        !items.length
      ) return [];
      return [{
        id: randomUUID(),
        type: action.type,
        target: String(action.target || `New ${orderKind} order for ${customerName}`).trim(),
        expectedStatus: "not_created",
        requestedStatus: "create",
        summary: String(action.summary || `Create a ${orderKind} order for ${customerName}.`).trim(),
        orderKind,
        customerName,
        phone,
        email: String(action.email || "").trim().toLowerCase(),
        address,
        deliveryDate,
        paymentHandling,
        items,
        status: "proposed",
        proposedAt: new Date().toISOString(),
      }];
    }
    const allowed = ACTION_STATUSES[action?.type];
    const target = String(action?.target || "").trim();
    const expectedStatus = String(action?.expectedStatus || "").trim().toLowerCase();
    const requestedStatus = String(action?.requestedStatus || "").trim().toLowerCase();
    if (!allowed?.has(requestedStatus) || !target || !expectedStatus) return [];
    return [{
      id: randomUUID(),
      type: action.type,
      target,
      expectedStatus,
      requestedStatus,
      summary: String(action.summary || `Change ${target} to ${requestedStatus}.`).trim(),
      orderKind: "",
      customerName: "",
      phone: "",
      email: "",
      address: "",
      deliveryDate: "",
      paymentHandling: "",
      items: [],
      status: "proposed",
      proposedAt: new Date().toISOString(),
    }];
  });

const statusCounts = async (Model) =>
  Model.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).then((rows) =>
    rows.map((row) => ({ status: row._id || "unknown", count: row.count }))
  );

const itemSummary = (items = []) =>
  items.slice(0, 8).map((item) => ({ sku: item.sku, product: item.productName, quantity: item.quantity }));

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLookupText = (value = "") =>
  String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const editDistance = (left = "", right = "") => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const findLikelyCustomerMatches = (question = "", records = []) => {
  const questionTokens = normalizeLookupText(question).split(" ").filter((token) => token.length >= 3);
  if (!questionTokens.length) return [];

  return records
    .flatMap((record) => {
      const nameTokens = normalizeLookupText(record.customerName).split(" ").filter(Boolean);
      if (!nameTokens.length) return [];
      const distances = nameTokens.map((nameToken) =>
        Math.min(...questionTokens.map((questionToken) => editDistance(nameToken, questionToken)))
      );
      const credible = distances.every((distance, index) => {
        const tokenLength = nameTokens[index].length;
        return distance <= (tokenLength >= 8 ? 2 : tokenLength >= 4 ? 1 : 0);
      });
      const score = distances.reduce((sum, distance) => sum + distance, 0);
      return credible && score <= Math.max(2, nameTokens.length)
        ? [{ ...record, matchScore: score }]
        : [];
    })
    .sort((left, right) => left.matchScore - right.matchScore)
    .slice(0, 5);
};

const NON_BUSINESS_COLLECTIONS = new Set([
  "accounts",
  "assistantentries",
  "sessions",
  "users",
  "verificationtokens",
]);

const SECRET_FIELD_PATTERN = /(^|_)(password|passwordhash|secret|apikey|access[_-]?token|refresh[_-]?token|session[_-]?token|verification[_-]?token|reset[_-]?token|otp)($|_)/i;

const serializeAdminBusinessValue = (value, key = "") => {
  if (SECRET_FIELD_PATTERN.test(key)) return "[REDACTED INFRASTRUCTURE SECRET]";
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => serializeAdminBusinessValue(item));
  if (typeof value === "object") {
    if (value._bsontype === "ObjectId") return undefined;
    return Object.fromEntries(
      Object.entries(value).flatMap(([childKey, childValue]) => {
        if (["_id", "__v"].includes(childKey)) return [];
        const serialized = serializeAdminBusinessValue(childValue, childKey);
        return serialized === undefined ? [] : [[childKey, serialized]];
      })
    );
  }
  return value;
};

const getCompleteAdminBusinessData = async () => {
  const database = mongoose.connection.db;
  if (!database) return {};
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const businessCollections = collections
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith("system.") && !NON_BUSINESS_COLLECTIONS.has(name.toLowerCase()))
    .sort();
  const entries = await Promise.all(
    businessCollections.map(async (name) => {
      const documents = await database.collection(name).find({}).toArray();
      return [name, documents.map((document) => serializeAdminBusinessValue(document))];
    })
  );
  return Object.fromEntries(entries);
};

async function getLocalKnowledge(question = "") {
  const targetPatterns = [...new Set(String(question).match(/[A-Za-z0-9][A-Za-z0-9_-]{2,}/g) || [])]
    .slice(0, 15)
    .map((value) => new RegExp(`^${escapeRegExp(value)}$`, "i"));
  const targetQuery = targetPatterns.length ? { $in: targetPatterns } : { $in: [] };
  const [
    preorderStatuses,
    planStatuses,
    subscriptionStatuses,
    skuStatuses,
    recipeStatuses,
    recentPreorders,
    recentPlans,
    recentSubscriptions,
    recentInvoices,
    skus,
    recipes,
    customers,
    matchedPreorders,
    matchedPlans,
    matchedSkus,
    completeBusinessDatabase,
  ] = await Promise.all([
    statusCounts(Preorder),
    statusCounts(OrderPlan),
    statusCounts(Subscription),
    statusCounts(Sku),
    statusCounts(RecipeFormula),
    Preorder.find().sort({ createdAt: -1 }).limit(25).select("-_id customerName orderNumber status fulfillmentMethod deliveryDate deliveredAt currency items totalQuantity total createdAt").lean(),
    OrderPlan.find().sort({ createdAt: -1 }).limit(25).select("-_id name orderNumber mode cadence status adminOrderKind firstDeliveryDate nextDeliveryDate currency items totalQuantity total createdAt").lean(),
    Subscription.find().sort({ createdAt: -1 }).limit(20).select("-_id name cadence durationWeeks status firstDeliveryDate nextDeliveryDate currency items totalQuantity total createdAt").lean(),
    Invoice.find().sort({ createdAt: -1 }).limit(25).select("-_id invoiceNumber customer.name currency items subtotal total grandTotal createdAt").lean(),
    Sku.find().sort({ displayOrder: 1, name: 1 }).limit(100).select("-_id sku name category packLabel unitPrice leadTimeDays status skuType recurringCutoffDate").lean(),
    RecipeFormula.find().sort({ updatedAt: -1 }).limit(50).select("-_id sku skuName baseYieldLitres ingredients.name ingredients.quantity ingredients.unit status version updatedAt").lean(),
    listCustomersFromOrders(),
    Preorder.find({ orderNumber: targetQuery }).limit(10).select("-_id customerName orderNumber status fulfillmentMethod deliveryDate currency items totalQuantity total createdAt").lean(),
    OrderPlan.find({ orderNumber: targetQuery }).limit(10).select("-_id name orderNumber mode cadence status adminOrderKind firstDeliveryDate nextDeliveryDate currency items totalQuantity total createdAt").lean(),
    Sku.find({ sku: targetQuery }).limit(10).select("-_id sku name category packLabel unitPrice status skuType").lean(),
    getCompleteAdminBusinessData(),
  ]);

  const data = {
    generatedAt: new Date().toISOString(),
    statusSummaries: {
      preorders: preorderStatuses,
      orderPlans: planStatuses,
      subscriptions: subscriptionStatuses,
      skus: skuStatuses,
      recipes: recipeStatuses,
    },
    recentPreorders: recentPreorders.map((row) => ({ ...row, items: itemSummary(row.items) })),
    recentOrderPlans: recentPlans.map((row) => ({ ...row, items: itemSummary(row.items) })),
    recentSubscriptions: recentSubscriptions.map((row) => ({ ...row, items: itemSummary(row.items) })),
    recentInvoices: recentInvoices.map((row) => ({
      invoiceNumber: row.invoiceNumber,
      customerName: row.customer?.name,
      currency: row.currency,
      items: itemSummary(row.items),
      subtotal: row.subtotal,
      total: row.total,
      grandTotal: row.grandTotal,
      createdAt: row.createdAt,
    })),
    skuCatalog: skus,
    recipes,
    customerDirectory: customers.map((customer) => ({
      customerName: customer.customerName,
      phone: customer.phone,
      email: customer.email,
      orderCount: customer.orderCount,
      lastOrderAt: customer.lastOrderAt,
    })),
    completeBusinessDatabase,
    exactTargetMatches: {
      preorders: matchedPreorders.map((row) => ({ ...row, items: itemSummary(row.items) })),
      orderPlans: matchedPlans.map((row) => ({ ...row, items: itemSummary(row.items) })),
      skus: matchedSkus,
    },
    likelyCustomerMatches: findLikelyCustomerMatches(question, [
      ...recentPreorders.map((row) => ({
        sourceType: "preorder",
        customerName: row.customerName,
        orderNumber: row.orderNumber,
        status: row.status,
      })),
      ...recentPlans.map((row) => ({
        sourceType: "order_plan",
        customerName: row.name,
        orderNumber: row.orderNumber,
        status: row.status,
        mode: row.mode,
      })),
    ]),
  };

  return {
    text: JSON.stringify(data),
    sources: [
      { label: "Live admin database snapshot", kind: "database", retrievedAt: data.generatedAt },
    ],
  };
}

async function getKnowledge(question) {
  const local = await getLocalKnowledge(question);
  if (isCollatoKnowledgeConfigured()) {
    try {
      const payload = await queryCollatoKnowledge(question);
      const matches = payload?.matches || payload?.sources || payload?.results || [];
      return {
        text: `${local.text}\n\nKNOWLEDGE SEARCH RESULTS\n${JSON.stringify(payload).slice(0, 80000)}`,
        sources: [
          ...local.sources,
          ...matches.slice(0, 8).map((source, index) => ({
            label: source.title || source.name || `Knowledge source ${index + 1}`,
            kind: source.sourceType || source.type || "knowledge",
            sourceId: source.sourceId || source.id || "",
          })),
        ],
      };
    } catch (error) {
      console.error("Assistant knowledge query failed; using local context", error);
    }
  }
  return local;
}

const getOutputText = (payload) => {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (content?.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
};

export async function generateAssistantAnswer({ userEntry }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI chat is not configured.");

  const question = userEntry.corrections?.at(-1)?.text || userEntry.originalText;
  const [knowledge, recentTurns] = await Promise.all([
    getKnowledge(question),
    AssistantEntry.find({
      conversationDate: userEntry.conversationDate,
      _id: { $ne: userEntry._id },
      parentEntryId: { $ne: userEntry._id },
    })
      .sort({ createdAt: -1 })
      .limit(12)
      .select("role originalText corrections createdAt")
      .lean(),
  ]);
  const conversation = recentTurns.reverse().map((turn) => ({
    role: turn.role || "user",
    text: turn.corrections?.at(-1)?.text || turn.originalText,
  }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ADMIN_CHAT_MODEL,
      reasoning: { effort: process.env.OPENAI_ADMIN_CHAT_REASONING || "low" },
      text: {
        verbosity: "medium",
        format: { type: "json_schema", name: "admin_assistant_answer", strict: true, schema: answerSchema },
      },
      instructions: `You are the action-enabled GGH operations assistant for authenticated administrators.
Answer the administrator's question directly and concisely. Treat a statement or note as something to acknowledge naturally.
Use only the supplied conversation and operational context for business-specific facts. Never invent orders, amounts, statuses, dates, inventory, recipes, or policies. The completeBusinessDatabase contains every operational MongoDB collection and record available to this authenticated admin assistant, except authentication infrastructure and secrets. Inspect it before claiming that business data is unavailable. If a requested fact truly does not exist there, say exactly what is missing.
Interpret requests like a practical human operations teammate. Understand ordinary wording, harmless grammatical variation, common synonyms, and minor customer-name spelling mistakes. Do not make the administrator use database terminology. The likelyCustomerMatches field contains conservative, server-computed typo-tolerant candidates. When it contains one plausible order for the name in the request, or several entries that all identify the same orderNumber, use that exact order. Ask for clarification only when two or more distinct orders remain genuinely plausible.
When the administrator explicitly asks for a supported database change and the current context uniquely identifies the target, return one action proposal per requested mutation. Supported actions are: update a preorder status using its exact orderNumber; update an order-plan status using its exact orderNumber; activate or archive a SKU using its exact SKU code; create a one-time manual or sample order. If the administrator identifies an order by customer name and exactly one current or likely record matches, resolve it to that record's exact orderNumber and propose the action. If multiple distinct orders match, ask which order number they mean.
For status changes, copy the record's current status into expectedStatus and leave all order-creation-only fields empty with items as an empty array. The allowed requested statuses come from this action contract, not from the set of statuses currently represented by records in the snapshot. "Shipped" and "delivered" are valid requested statuses for both update_preorder_status and update_order_plan_status even when no current record already has that status. "Delivered" is the administrator-facing term; the database stores a completed delivery as fulfilled. Valid preorder targets are confirmed, shipped, delivered, and cancelled. Valid order-plan targets are confirmed, shipped, delivered, cancelled, active, and paused; the executor will enforce mode and payment transition rules.
For create_manual_order, use expectedStatus "not_created", requestedStatus "create", and require: orderKind manual or sample, recipient/customer name, delivery date in YYYY-MM-DD, at least one exact active SKU with quantity, and paymentHandling. A manual order additionally requires a valid phone and delivery address. A sample always uses never_collect and may leave phone, email, and address empty when it is only being recorded internally. A manual order must explicitly use mark_paid, collect_later, or never_collect. Email may be empty. Do not infer missing required details—ask a concise clarification instead. The action does not send customer notifications.
Never invent business data or act when multiple distinct records are genuinely plausible. A minor typo, colloquial status name, or obvious synonym is not ambiguity when the supplied context identifies one clear record. Ask a concise clarifying question only when a required detail is missing or the choice could materially affect different records. Do not reject an explicitly allowed requested status merely because it does not occur elsewhere in the snapshot.
An action proposal is not execution. Tell the administrator to review and confirm the action card. Never say a change has happened until a later system result says it completed.
Use Markdown for concise explanatory prose and choose rich rendering when it makes the answer faster to understand. Available renderers are: tables; bar, line, area, pie, and donut charts; metric cards; status panels; progress panels; timelines; side-by-side comparisons; geographic maps; and database action cards. Use tables for detailed records, metrics for headline numbers, status for operational health, progress for explicit percentages, timelines for dated sequences, comparison for alternatives or period-over-period values, and charts only for explicit numeric data. Do not duplicate the same information across prose and visuals. Chart series lengths must match labels. Pie and donut charts must have exactly one series. For widgets, fill every item field; use an empty detail, neutral status, and progress 0 when those fields do not apply. When the administrator asks to map, plot, locate, or show geographic business data, create a map containing the relevant exact addresses from the database. Use one marker per relevant customer or operational location, label it clearly, and never invent an address or coordinates. The application will geocode the supplied addresses with Google Maps. This is an authenticated admin workspace: all supplied business data may be read, combined, analysed, and shown when the administrator requests it, including customer contacts and addresses, orders, payments, invoices, production data, inventory, recipes, settings, discounts, and operational history. The customerDirectory is the complete deduplicated customer contact list derived from orders; when asked for all customers or contact details, use it and do not claim those fields are unavailable. Infrastructure secrets, authentication/session data, and internal database IDs are intentionally absent and must never be requested or invented.
When relying on the supplied operational context, mention that the answer uses the current admin data snapshot.`,
      input: `RECENT CONVERSATION\n${JSON.stringify(conversation)}\n\nCURRENT ADMIN MESSAGE\n${question}\n\nOPERATIONAL CONTEXT\n${knowledge.text}`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "OpenAI could not answer this question.");
  const outputText = getOutputText(payload);
  if (!outputText) throw new Error("The assistant returned an empty answer.");
  const result = JSON.parse(outputText);
  return {
    answer: String(result.answer || "").trim() || "I could not produce an answer.",
    tables: Array.isArray(result.tables) ? result.tables : [],
    charts: Array.isArray(result.charts) ? result.charts : [],
    widgets: (Array.isArray(result.widgets) ? result.widgets : []).slice(0, 4).map((widget) => ({
      type: ["metrics", "status", "progress", "timeline", "comparison"].includes(widget?.type) ? widget.type : "metrics",
      title: String(widget?.title || "Overview").trim(),
      items: (Array.isArray(widget?.items) ? widget.items : []).slice(0, 20).map((item) => ({
        label: String(item?.label || "").trim(),
        value: String(item?.value || "").trim(),
        detail: String(item?.detail || "").trim(),
        status: ["neutral", "info", "success", "warning", "error"].includes(item?.status) ? item.status : "neutral",
        progress: Math.min(100, Math.max(0, Number(item?.progress || 0))),
      })),
    })).filter((widget) => widget.items.length),
    maps: (Array.isArray(result.maps) ? result.maps : []).slice(0, 3).map((map) => ({
      title: String(map?.title || "Map").trim(),
      markers: (Array.isArray(map?.markers) ? map.markers : []).slice(0, 100).flatMap((marker) => {
        const label = String(marker?.label || "Location").trim();
        const address = String(marker?.address || "").trim();
        return address ? [{ label, address }] : [];
      }),
    })).filter((map) => map.markers.length),
    actions: normalizeProposedActions(Array.isArray(result.actions) ? result.actions : []),
    sources: knowledge.sources,
  };
}

export async function createAssistantReply({ userEntry, createdBy }) {
  try {
    const result = await generateAssistantAnswer({ userEntry });
    return AssistantEntry.create({
      originalText: result.answer,
      role: "assistant",
      parentEntryId: userEntry._id,
      inputType: "text",
      createdBy,
      conversationDate: userEntry.conversationDate,
      processingStatus: "logged",
      answerModel: ADMIN_CHAT_MODEL,
      responseData: {
        tables: result.tables,
        charts: result.charts,
        widgets: result.widgets,
        maps: result.maps,
        sources: result.sources,
        actions: result.actions,
      },
      actionStatus: result.actions.length ? "proposed" : "none",
      schemaVersion: 2,
    });
  } catch (error) {
    console.error("Admin assistant answer error", error);
    return AssistantEntry.create({
      originalText: "I saved your message, but I couldn't generate an answer. You can retry this response.",
      role: "assistant",
      parentEntryId: userEntry._id,
      inputType: "text",
      createdBy,
      conversationDate: userEntry.conversationDate,
      processingStatus: "answer_failed",
      processingError: error instanceof Error ? error.message : "Answer generation failed.",
      answerModel: ADMIN_CHAT_MODEL,
      actionStatus: "none",
      schemaVersion: 2,
    });
  }
}
