import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Load the project's ESM files without changing Next's CommonJS package config.
const importSource = (path) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(path, import.meta.url), "utf8")).toString("base64")}`);
const pricing = await importSource("../libs/prepaid-subscriptions.js");
const subscriptions = await importSource("../libs/subscriptions.js");
const catalog = [80, 100, 120].map((unitPrice, index) => ({ sku: `KANJI-${index}`, name: `Kanji ${index}`, category: "kanji", status: "active", unitPrice }));
const mixed = catalog.map((item) => ({ ...item, quantity: 2 }));

for (const [weeks, coupon, expected] of [[1, "", 650], [2, "", 1250], [4, "", 2450], [2, "TRAYA", 1190], [4, "TRAYA", 2210]]) {
  test(`${weeks} week(s), ${coupon || "no coupon"}: bottles plus one fee`, () => {
    const result = pricing.calculatePrepaidSubscriptionPrice({ weeklySubtotal: 600, durationWeeks: weeks, code: coupon });
    assert.equal(result.total, expected);
    assert.equal(result.processingFee, 50);
    assert.equal(result.deliveryFee, 0);
    assert.equal(result.subtotal, 600 * weeks);
  });
}

test("TRAYA is case insensitive, bottle-only, and rejected for trial/other plans", () => {
  assert.equal(pricing.calculatePrepaidSubscriptionPrice({ weeklySubtotal: 600, durationWeeks: 4, code: " traya " }).discount.discountAmount, 240);
  for (const weeks of [1, 0, 3, 6, 8, 2.5]) assert.throws(() => pricing.calculatePrepaidSubscriptionPrice({ durationWeeks: weeks, code: "TRAYA" }));
  assert.throws(() => pricing.calculatePrepaidSubscriptionPrice({ durationWeeks: 2, code: "OTHER" }));
});

test("mixed box uses two each of active kanjis and single boxes use six", () => {
  const boxes = pricing.getKanjiSubscriptionBoxes([...catalog, { sku: "ARCHIVED", category: "kanji", status: "archived" }, { sku: "SPARKLE", category: "sparkle", status: "active" }]);
  assert.equal(boxes.length, 4);
  assert.deepEqual(boxes[0].items.map((item) => item.quantity), [2, 2, 2]);
  assert.equal(boxes[1].items[0].quantity, 6);
  assert.equal(pricing.getKanjiSubscriptionBoxes(catalog.slice(0, 2)).some((box) => box.id === "mixed"), false);
});

test("server rejects duplicate, fractional, unavailable, and incorrect boxes", () => {
  pricing.assertSubscriptionBox(mixed, catalog, 4);
  pricing.assertSubscriptionBox([{ ...catalog[0], quantity: 6 }], catalog, 2);
  for (const items of [mixed.slice(0, 2), [{ ...catalog[0], quantity: 3 }, { ...catalog[0], quantity: 3 }], [{ ...catalog[0], quantity: 2.5 }, { ...catalog[1], quantity: 3.5 }], [{ sku: "SPARKLE", quantity: 6 }], [{ ...catalog[0], quantity: 3 }, { ...catalog[1], quantity: 3 }]]) {
    assert.throws(() => pricing.assertSubscriptionBox(items, catalog, 2));
  }
  pricing.assertSubscriptionBox([{ ...catalog[0], quantity: 3 }, { ...catalog[1], quantity: 3 }], catalog, 1);
});

test("ready-to-go sets offered for prepaid plans must match a valid six-bottle kanji box", () => {
  const combos = [
    { id: "mixed", status: "active", items: mixed },
    { id: "single", status: "active", items: [{ sku: catalog[0].sku, quantity: 6 }] },
    { id: "trial-only", status: "active", items: [{ sku: catalog[0].sku, quantity: 3 }, { sku: catalog[1].sku, quantity: 3 }] },
    { id: "short", status: "active", items: [{ sku: catalog[0].sku, quantity: 4 }] },
    { id: "non-kanji", status: "active", items: [{ sku: "SPARKLE", quantity: 6 }] },
    { id: "archived", status: "archived", items: mixed },
  ];
  assert.deepEqual(pricing.getEligiblePrepaidSubscriptionCombos(combos, catalog, 4).map((combo) => combo.id), ["mixed", "single"]);
  assert.deepEqual(pricing.getEligiblePrepaidSubscriptionCombos(combos, catalog, 1).map((combo) => combo.id), ["mixed", "single", "trial-only"]);
});

test("weekly delivery count matches plans and legacy durations remain readable", () => {
  for (const weeks of [1, 2, 4, 3, 6, 8]) assert.equal(subscriptions.getSubscriptionDurationConfig("weekly", weeks).totalCount, weeks);
  assert.equal(subscriptions.formatSubscriptionDuration(1), "Trial");
  assert.equal(subscriptions.formatSubscriptionDuration(4), "4 weeks");
});

test("delivery invoices sum to upfront payment; fee appears only once", () => {
  const totals = pricing.calculatePrepaidSubscriptionPrice({ weeklySubtotal: 600, durationWeeks: 4, code: "TRAYA" });
  const order = { ...totals, items: mixed, durationWeeks: 4, firstDeliveryDate: "2026-10-09" };
  const invoices = ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"].map((date) => pricing.getSubscriptionDeliveryPricing(order, date));
  assert.equal(invoices.reduce((sum, invoice) => sum + invoice.total, 0), totals.total);
  assert.deepEqual(invoices.map((invoice) => invoice.processingFee), [50, 0, 0, 0]);
  assert.deepEqual(invoices.map((invoice) => invoice.discountAmount), [60, 60, 60, 60]);
  assert.throws(() => pricing.getSubscriptionDeliveryPricing(order, "2026-10-10"));
});

test("subscription expiry includes all purchased weeks and handles month boundaries", () => {
  assert.equal(pricing.getSubscriptionEndDate({ startDate: "2026-10-09", durationWeeks: 1 }), "2026-10-15");
  assert.equal(pricing.getSubscriptionEndDate({ startDate: "2026-10-09", durationWeeks: 4 }), "2026-11-05");
});

// Execute real business code with its external services supplied as test doubles.
const loadWithDependencies = (path, dependencies, exports) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8").replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];/g, "").replace(/export\s+(?=(const|async function|function)\b)/g, "");
  return new Function(...Object.keys(dependencies), `${source}\nreturn { ${exports.join(", ")} };`)(...Object.values(dependencies));
};

test("request uses trusted SKU prices, preserves weekly items, and charges entire plan", async () => {
  const body = { name: "Test Customer", email: "test@example.com", phone: "9999999999", address: "Test address", cadence: "weekly", durationWeeks: 4, discountCode: "TRAYA", startDate: "2026-10-09", items: mixed.map((item) => ({ ...item, unitPrice: 1 })) };
  const deps = {
    ...pricing, ...subscriptions, connectMongo: async () => {},
    listSkuCatalog: async () => catalog, listSubscriptionCombos: async () => [], hydrateSubscriptionCombo: (item) => item,
    getSubscriptionSettings: async () => ({ deliveryDaysOfWeek: ["friday"], minimumLeadDays: 0 }), getSettingsCategoryLeadTimes: () => ({}),
    getEffectiveSkuLeadTimeDays: () => 0, getSkuMap: (items) => new Map(items.map((item) => [item.sku, item])),
    PreorderWindow: { findOne: () => ({ sort: async () => null }) }, getActiveWindowFilter: () => ({}),
    sanitizeDeliveryDaysOfWeek: (value) => value || [], sanitizeMinimumLeadDays: (value) => value || 0, sanitizeRecurringMinTotalQuantity: () => 6,
    MAX_PER_ORDER_LIMIT: 10, MAX_TOTAL_QTY: 30,
    listAvailableSubscriptionStartDates: () => [], getDefaultSubscriptionStartDate: () => "2026-10-09", isValidSubscriptionStartDate: () => true,
    getNextSubscriptionDeliveryDate: ({ startDate }) => startDate, listPlannedSubscriptionDeliveryDates: ({ totalCount }) => Array.from({ length: totalCount }, (_, i) => `2026-10-${9 + i * 7}`),
    buildSeasonalCutoffMapFromCatalog: () => new Map(), getSeasonalCoverageError: () => "",
    calculateDeliveryQuote: async () => { throw new Error("Unexpected delivery call"); }, getPlaceDetails: async () => ({}),
    ...Object.fromEntries(["Address", "Email", "Name", "Phone", "SessionToken"].flatMap((key) => [[`normalize${key}`, (value) => value], [`isValid${key}`, () => true]])), isValidPlaceId: () => true,
    isValidEmail: (value) => Boolean(value),
  };
  const { buildSubscriptionRequest } = loadWithDependencies("../libs/subscription-request.js", deps, ["buildSubscriptionRequest"]);
  const result = await buildSubscriptionRequest(body, { prepaid: true });
  assert.equal(result.total, 2210);
  assert.equal(result.subtotal, 2400);
  assert.equal(result.totalQuantity, 6);
  assert.deepEqual(result.items.map((item) => item.unitPrice), [80, 100, 120]);
  await assert.rejects(buildSubscriptionRequest({ ...body, durationWeeks: 3 }, { prepaid: true }));
  await assert.rejects(buildSubscriptionRequest({ ...body, cadence: "monthly" }, { prepaid: true }));
  await assert.rejects(buildSubscriptionRequest({ ...body, email: "" }, { prepaid: true }));
  assert.equal((await buildSubscriptionRequest({ ...body, email: "" }, { prepaid: true, allowMissingEmail: true })).email, "");
  const legacy = await buildSubscriptionRequest({ ...body, durationWeeks: 6 });
  assert.equal(legacy.total, 600);

  const configuredSets = [
    { id: "six-kanji", name: "Six Kanji", status: "active", items: [{ sku: catalog[1].sku, quantity: 6, unitPrice: 1 }] },
    { id: "short-set", name: "Short Set", status: "active", items: [{ sku: catalog[0].sku, quantity: 4 }] },
  ];
  const { buildSubscriptionRequest: buildConfiguredSetRequest } = loadWithDependencies(
    "../libs/subscription-request.js",
    { ...deps, listSubscriptionCombos: async () => configuredSets },
    ["buildSubscriptionRequest"]
  );
  const configuredSetBody = { ...body, selectionMode: "combo", comboId: "six-kanji", items: [{ sku: catalog[0].sku, quantity: 6, unitPrice: 1 }] };
  const configuredSet = await buildConfiguredSetRequest(configuredSetBody, { prepaid: true });
  assert.equal(configuredSet.selectionMode, "combo");
  assert.equal(configuredSet.comboId, "six-kanji");
  assert.equal(configuredSet.comboName, "Six Kanji");
  assert.deepEqual(configuredSet.items.map(({ sku, quantity, unitPrice }) => ({ sku, quantity, unitPrice })), [
    { sku: catalog[1].sku, quantity: 6, unitPrice: 100 },
  ]);
  assert.equal(configuredSet.total, 2210);
  await assert.rejects(buildConfiguredSetRequest({ ...configuredSetBody, comboId: "missing" }, { prepaid: true }), /available subscription combos/);
  await assert.rejects(buildConfiguredSetRequest({ ...configuredSetBody, comboId: "short-set" }, { prepaid: true }), /exactly six bottles/);
});

test("renewal job claims once, retries failures, and selects paid plans near expiry", async () => {
  let sent = 0;
  let capturedFilter;
  let claimed = false;
  let completed = false;
  const order = { _id: "id", id: "id", name: "Test", email: "test@example.com", subscriptionEndDate: "2026-10-10" };
  const deps = {
    config: { domainName: "example.com", mailgun: {} }, connectMongo: async () => {},
    sendResendEmail: async (payload) => { sent++; assert.match(payload.text, /no automatic charges/); assert.equal(payload.idempotencyKey, "subscription-renewal-id"); },
    OrderPlan: {
      find: (filter) => { capturedFilter = filter; return { select: () => ({ limit: () => ({ lean: async () => [{ _id: "id" }] }) }) }; },
      findOneAndUpdate: async () => { if (claimed || completed) return null; claimed = true; return order; },
      updateOne: async (_query, update) => { if (update.$set) completed = true; claimed = false; },
    },
  };
  const { sendDueSubscriptionRenewals } = loadWithDependencies("../libs/subscription-renewals.js", deps, ["sendDueSubscriptionRenewals"]);
  const now = new Date("2026-10-07T04:30:00Z");
  assert.deepEqual(await sendDueSubscriptionRenewals({ now }), { sent: 1, failed: 0 });
  assert.deepEqual(await sendDueSubscriptionRenewals({ now }), { sent: 0, failed: 0 });
  assert.equal(sent, 1);
  assert.equal(capturedFilter["payment.status"], "paid");
  assert.deepEqual(capturedFilter.subscriptionEndDate, { $gte: "2026-10-07", $lte: "2026-10-10" });
});

test("creation uses a single Razorpay order and reserves all weekly deliveries", async () => {
  let reservation;
  let paymentRequest;
  const quote = { mode: "recurring", paymentType: "one_time", name: "Test", email: "test@example.com", cadence: "weekly", durationWeeks: 4, startDate: "2026-10-09", firstDeliveryDate: "2026-10-09", items: mixed, total: 2210, ...pricing.calculatePrepaidSubscriptionPrice({ weeklySubtotal: 600, durationWeeks: 4, code: "TRAYA" }) };
  const deps = {
    ...subscriptions, ...pricing, NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    connectMongo: async () => {}, buildOrderPlanRequest: async () => quote,
    enforceBrowserOrigin: () => null, readJsonBody: async () => ({ mode: "subscription" }), jsonError: (error, status) => ({ error, status }), logAbuseEvent: () => {},
    isRazorpayConfigured: () => true, getRazorpayPublicConfig: () => ({ isConfigured: true }),
    createRazorpayOrder: async (request) => { paymentRequest = request; return { id: "order_123", amount: request.amount, currency: "INR" }; },
    createSignedCheckoutToken: (payload) => { assert.equal(payload.kind, "order_plan_one_time"); return "token"; },
    reserveNextOrderNumber: async () => "GGH123", WEBSITE_INVENTORY_HOLD_MS: 900000,
    createOrderPlanWithInventory: async (request) => { reservation = request; return { ...request.orderPayload, id: "id", save: async () => {} }; },
    syncCollatoKnowledgeDocument: async () => {},
  };
  const { POST } = loadWithDependencies("../app/api/order-plan/route.js", deps, ["POST"]);
  const result = await POST({});
  assert.equal(result.status, 200);
  assert.equal(paymentRequest.amount, 221000);
  assert.equal(reservation.totalCycles, 4);
  assert.equal(reservation.orderPayload.subscriptionEndDate, "2026-11-05");
  assert.equal(result.body.razorpay.order_id, "order_123");
  assert.equal(result.body.razorpay.subscription_id, undefined);
  assert.equal(result.body.orderPlan.payment.totalCount, 4);
  deps.isRazorpayConfigured = () => false;
  const unavailable = loadWithDependencies("../app/api/order-plan/route.js", deps, ["POST"]);
  assert.equal((await unavailable.POST({})).status, 503);
});

test("payment callback rejects wrong orders and uncaptured payments, then confirms prepaid inventory", async () => {
  let committed = 0;
  let captured = false;
  let callbackOrder = "wrong_order";
  const order = { id: "id", mode: "recurring", paymentType: "one_time", total: 2210, currency: "INR", status: "payment_pending", payment: { orderId: "order_123", status: "order_created" }, notifications: { confirmationEmailSentAt: new Date(), adminOrderEmailSentAt: new Date() }, save: async () => {} };
  const deps = {
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) }, connectMongo: async () => {},
    Sku: { find: () => ({ select: () => ({ lean: async () => [] }) }) }, buildSeasonalCutoffMapFromCatalog: () => new Map(),
    verifySignedCheckoutToken: () => ({ kind: "order_plan_one_time", orderPlanId: "id", razorpayOrderId: "order_123" }), OrderPlan: { findById: async () => order },
    extractRazorpayPaymentResult: () => ({ orderId: callbackOrder, paymentId: "pay_123", signature: "sig" }), verifyRazorpayPaymentSignature: () => true,
    verifyRazorpayPaymentWithApi: async () => ({ ok: true, payment: { order_id: "order_123", status: captured ? "captured" : "authorized" } }),
    getRazorpayPaymentVerificationError: () => "Payment is not captured.",
    commitPaidOrderInventory: async () => { committed++; return order; }, recalculateSubscriptionRouteSnapshots: async () => {}, syncCollatoKnowledgeDocument: async () => {},
  };
  const { PATCH } = loadWithDependencies("../app/api/order-plan/payment/route.js", deps, ["PATCH"]);
  const request = { json: async () => ({ checkoutToken: "token" }) };
  assert.equal((await PATCH(request)).status, 400);
  callbackOrder = "order_123";
  assert.equal((await PATCH(request)).status, 400);
  assert.equal(committed, 0);
  captured = true;
  assert.equal((await PATCH(request)).status, 200);
  assert.equal(order.payment.status, "paid");
  assert.equal(order.status, "active");
  assert.equal(committed, 1);
  assert.equal((await PATCH(request)).status, 200);
});
