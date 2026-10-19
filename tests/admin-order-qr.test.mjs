import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (path, dependencies, exports) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];/g, "")
    .replace(/export\s+(?=(const|async function|function|class)\b)/g, "");
  return new Function(...Object.keys(dependencies), `${source}\nreturn { ${exports.join(", ")} };`)(...Object.values(dependencies));
};
const json = (body, options = {}) => ({ body, status: options.status || 200 });
const createOrder = () => ({
  id: "0123456789abcdef01234567", orderNumber: "GGH-TEST", source: "admin", mode: "one_time", paymentType: "one_time",
  name: "QR Customer", currency: "INR", total: 1090, status: "payment_pending",
  payment: { provider: "razorpay", status: "pending", qrCodeId: "qr_test" },
  inventory: { status: "held" }, notifications: {}, save: async () => {},
});
const qrFixture = () => ({ id: "qr_test", image_url: "https://rzp.io/i/test", status: "active", type: "upi_qr", usage: "single_use", fixed_amount: true, payment_amount: 109000, close_by: Math.floor(Date.now() / 1000) + 1800 });
const captured = () => ({ id: "pay_test", status: "captured", amount: 109000, currency: "INR", order_id: "order_qr", created_at: 1791624000 });

function serviceFixture() {
  const order = createOrder();
  const state = { qr: qrFixture(), payments: [], commits: 0, releases: 0, emails: 0, closes: 0 };
  const deps = {
    WEBSITE_INVENTORY_HOLD_MS: 1800000,
    createRazorpayQrCode: async request => { state.creation = request; return state.qr; },
    fetchRazorpayQrCode: async id => { assert.equal(id, "qr_test"); return state.qr; },
    fetchRazorpayQrPayments: async id => { assert.equal(id, "qr_test"); return state.payments; },
    closeRazorpayQrCode: async () => { state.closes++; state.qr = { ...state.qr, status: "closed", close_reason: "on_demand" }; return state.qr; },
    commitPaidOrderInventory: async () => { if (order.inventory.status !== "committed") state.commits++; order.inventory.status = "committed"; return order; },
    releaseOrderInventory: async args => { state.releases++; order.status = args.setOrderStatus; order.payment.status = args.setPaymentStatus; order.inventory.status = args.expired ? "expired" : "released"; return order; },
    recalculateSubscriptionRouteSnapshots: async () => {}, syncCollatoKnowledgeDocument: async () => {},
    sendOrderPlanConfirmationEmail: async () => { state.emails++; }, sendAdminOrderPlanConfirmedEmail: async () => { state.emails++; },
    OrderPlan: {
      findById: async () => order,
      findOneAndUpdate: async (query, update) => {
        const notificationField = Object.keys(query).find(key => key.startsWith("notifications."));
        if (notificationField) {
          if (order.notifications[notificationField.split(".")[1]]) return null;
          const claimField = Object.keys(update.$set)[0].split(".")[1];
          if (order.notifications[claimField]) return null;
          order.notifications[claimField] = update.$set[Object.keys(update.$set)[0]];
          return order;
        }
        assert.equal(query["payment.qrCodeId"], order.payment.qrCodeId);
        if (order.payment.status === "paid") return null;
        for (const [key, value] of Object.entries(update.$set)) {
          if (key.startsWith("payment.")) order.payment[key.slice(8)] = value;
          else order[key] = value;
        }
        return order;
      },
      updateOne: async (_query, update) => {
        for (const [key, value] of Object.entries(update.$set)) order.notifications[key.split(".")[1]] = value;
      },
    },
  };
  return { order, state, deps, ...load("../libs/admin-order-qr.js", deps, ["createAdminOrderQrPayment", "syncAdminOrderQrPayment"]) };
}

test("QR creation fixes the trusted INR amount, expiry, and admin order identity", async () => {
  const fixture = serviceFixture();
  await fixture.createAdminOrderQrPayment(fixture.order);
  assert.equal(fixture.state.creation.amount, 109000);
  assert.equal(fixture.state.creation.notes.orderPlanId, fixture.order.id);
  assert.equal(fixture.order.payment.qrCodeId, "qr_test");
  assert.equal(fixture.order.payment.status, "pending");
  assert.equal(fixture.order.inventory.expiresAt.getTime(), fixture.order.payment.qrExpiresAt.getTime());
  for (const invalid of [{ source: "landing" }, { mode: "recurring", paymentType: "recurring" }, { currency: "USD" }, { total: 0 }]) {
    await assert.rejects(fixture.createAdminOrderQrPayment({ ...fixture.order, ...invalid }));
  }
});

test("prepaid subscription QR reserves the full plan and activates it after captured payment", async () => {
  const fixture = serviceFixture();
  fixture.order.mode = "recurring";
  fixture.order.durationWeeks = 4;
  await fixture.createAdminOrderQrPayment(fixture.order);
  assert.equal(fixture.order.payment.totalCount, 4);
  assert.equal(fixture.order.payment.status, "pending");
  fixture.state.payments = [captured()];
  await fixture.syncAdminOrderQrPayment(fixture.order);
  assert.equal(fixture.order.status, "active");
  assert.equal(fixture.order.payment.paidCount, 4);
  assert.equal(fixture.order.payment.remainingCount, 0);
  assert.equal(fixture.state.commits, 1);
});

test("QR adapter uses Razorpay single-use UPI fixed-amount API, not checkout orders", async () => {
  const requests = [];
  const { createRazorpayQrCode } = load("../libs/razorpay.js", {
    process: { env: { RAZORPAY_KEY_ID: "test", RAZORPAY_KEY_SECRET: "test" } },
    fetch: async (url, options) => { requests.push({ url, ...JSON.parse(options.body) }); return { ok: true, json: async () => qrFixture() }; },
  }, ["createRazorpayQrCode"]);
  await createRazorpayQrCode({ amount: 109000, closeBy: 1800000000, name: "GGH", notes: { orderPlanId: "id" } });
  assert.equal(requests[0].url, "https://api.razorpay.com/v1/payments/qr_codes");
  assert.equal(requests[0].type, "upi_qr");
  assert.equal(requests[0].usage, "single_use");
  assert.equal(requests[0].fixed_amount, true);
  assert.equal(requests[0].payment_amount, 109000);
});

test("authorized, wrong-amount, wrong-currency, and unrelated QR payments cannot confirm the order", async () => {
  const fixture = serviceFixture();
  for (const invalid of [{ status: "authorized" }, { amount: 108999 }, { currency: "USD" }, { id: "" }]) {
    fixture.state.payments = [{ ...captured(), ...invalid }];
    await fixture.syncAdminOrderQrPayment(fixture.order);
    assert.equal(fixture.order.payment.status, "pending");
  }
  fixture.state.qr.id = "qr_other";
  await assert.rejects(fixture.syncAdminOrderQrPayment(fixture.order));
  assert.equal(fixture.state.commits, 0);
  assert.equal(fixture.state.emails, 0);
});

test("captured payment confirms production, commits stock once, and duplicate status checks are idempotent", async () => {
  const fixture = serviceFixture();
  fixture.state.payments = [captured()];
  await fixture.syncAdminOrderQrPayment(fixture.order);
  await fixture.syncAdminOrderQrPayment(fixture.order);
  assert.equal(fixture.order.status, "confirmed");
  assert.equal(fixture.order.payment.paymentId, "pay_test");
  assert.equal(fixture.order.payment.orderId, "order_qr");
  assert.equal(fixture.state.commits, 1);
  assert.equal(fixture.state.emails, 2);
});

test("expired or cancelled unpaid QR releases stock; received payments still syncing do not", async () => {
  const expired = serviceFixture();
  expired.state.qr = { ...expired.state.qr, status: "closed", close_reason: "expired" };
  await expired.syncAdminOrderQrPayment(expired.order);
  assert.equal(expired.order.payment.status, "expired");
  assert.equal(expired.state.releases, 1);
  const cancelled = serviceFixture();
  await cancelled.syncAdminOrderQrPayment(cancelled.order, { cancel: true });
  assert.equal(cancelled.order.status, "cancelled");
  assert.equal(cancelled.state.closes, 1);
  const syncing = serviceFixture();
  syncing.state.qr = { ...syncing.state.qr, status: "closed", close_reason: "paid", payments_amount_received: 109000 };
  await syncing.syncAdminOrderQrPayment(syncing.order, { cancel: true });
  assert.equal(syncing.state.releases, 0);
  assert.equal(syncing.order.payment.status, "pending");
});

test("payment racing with cancellation wins and remains confirmed", async () => {
  const fixture = serviceFixture();
  fixture.state.payments = [captured()];
  await fixture.syncAdminOrderQrPayment(fixture.order, { cancel: true });
  assert.equal(fixture.order.status, "confirmed");
  assert.equal(fixture.order.payment.status, "paid");
  assert.equal(fixture.state.releases, 0);
});

function creationFixture() {
  const state = { admin: true, body: { mode: "one_time", paymentMethod: "qr" }, qrCalls: 0, checkoutCalls: 0, notifications: 0, releases: 0 };
  const quote = { mode: "one_time", paymentType: "one_time", currency: "INR", total: 1090 };
  const deps = {
    NextResponse: { json }, enforceBrowserOrigin: () => null,
    readJsonBody: async () => state.body, jsonError: (error, status) => ({ body: { error }, status }), logAbuseEvent: () => {},
    getAdminSessionState: async () => ({ session: state.admin ? { user: { email: "admin@example.test" } } : null, isAdmin: state.admin }),
    isRazorpayConfigured: () => true, getRazorpayPublicConfig: () => ({ isConfigured: true }),
    buildOrderPlanRequest: async (_body, options) => { state.allowMissingEmail = options.allowMissingEmail; return quote; },
    connectMongo: async () => {}, reserveNextOrderNumber: async () => "GGH-TEST", WEBSITE_INVENTORY_HOLD_MS: 1800000,
    createOrderPlanWithInventory: async args => { state.reservation = args; return { ...createOrder(), ...args.orderPayload }; },
    createAdminOrderQrPayment: async order => { state.qrCalls++; if (state.failQr) throw new Error("QR unavailable"); order.payment.qrImageUrl = "https://rzp.io/i/test"; },
    createRazorpayOrder: async args => { state.checkoutCalls++; return { id: "order_web", amount: args.amount, currency: "INR" }; },
    createSignedCheckoutToken: () => "public_checkout_token", syncCollatoKnowledgeDocument: async () => {},
    getSubscriptionDurationConfig: () => ({ totalCount: 4 }), getSubscriptionEndDate: () => "2026-11-05",
    recalculateSubscriptionRouteSnapshots: async () => {},
    sendOrderPlanConfirmationEmail: async () => { state.notifications++; },
    releaseOrderInventory: async () => { state.releases++; },
    console: { error: () => {} },
  };
  return { state, quote, POST: load("../app/api/order-plan/route.js", deps, ["POST"]).POST };
}

test("QR creation requires admin, holds inventory without committing, and never launches normal checkout", async () => {
  const fixture = creationFixture();
  fixture.state.admin = false;
  assert.equal((await fixture.POST({})).status, 403);
  assert.equal(fixture.state.qrCalls, 0);
  fixture.state.admin = true;
  const response = await fixture.POST({});
  assert.equal(response.status, 200);
  assert.equal(response.body.qrPayment, true);
  assert.equal(response.body.checkoutToken, "");
  assert.equal(fixture.state.allowMissingEmail, true);
  assert.equal(fixture.state.reservation.orderPayload.source, "admin");
  assert.equal(fixture.state.reservation.commitImmediately, false);
  assert.equal(fixture.state.reservation.channel, "admin");
  assert(fixture.state.reservation.expiresAt instanceof Date);
  assert.equal(fixture.state.notifications, 0);
  assert.equal(fixture.state.checkoutCalls, 0);
});

test("QR failure releases stock and does not fall back to checkout", async () => {
  const fixture = creationFixture();
  fixture.state.failQr = true;
  assert.equal((await fixture.POST({})).status, 502);
  assert.equal(fixture.state.releases, 1);
  assert.equal(fixture.state.checkoutCalls, 0);
});

test("admin can create a prepaid subscription with QR or manual payment", async () => {
  const fixture = creationFixture();
  Object.assign(fixture.quote, { mode: "recurring", paymentType: "one_time", cadence: "weekly", durationWeeks: 4 });
  fixture.state.body = { mode: "subscription", paymentMethod: "qr" };
  const qrResponse = await fixture.POST({});
  assert.equal(qrResponse.status, 200);
  assert.equal(qrResponse.body.qrPayment, true);
  assert.equal(fixture.state.reservation.totalCycles, 4);
  assert.equal(fixture.state.reservation.commitImmediately, false);
  assert.equal(fixture.state.reservation.orderPayload.subscriptionEndDate, "2026-11-05");
  fixture.state.body = { mode: "subscription", manualWithoutPayment: true, manualPaymentAction: "mark_paid" };
  const paidResponse = await fixture.POST({});
  assert.equal(paidResponse.status, 200);
  assert.equal(fixture.state.reservation.commitImmediately, true);
  assert.equal(paidResponse.body.orderPlan.status, "active");
  assert.equal(paidResponse.body.orderPlan.payment.status, "paid");
  assert.equal(paidResponse.body.orderPlan.payment.paidCount, 4);
  fixture.state.body.manualPaymentAction = "collect_later";
  const pendingResponse = await fixture.POST({});
  assert.equal(pendingResponse.status, 200);
  assert.equal(fixture.state.reservation.commitImmediately, false);
  assert.equal(fixture.state.reservation.expiresAt, null);
  assert.equal(pendingResponse.body.orderPlan.status, "payment_pending");
  assert.equal(pendingResponse.body.orderPlan.payment.remainingCount, 4);
  assert.match(pendingResponse.body.message, /Collect the full payment before deliveries begin/);
});

test("collect-later admin subscription becomes active and commits every reserved week when marked paid", async () => {
  const order = {
    id: "subscription-order", source: "admin", mode: "recurring", paymentType: "one_time",
    durationWeeks: 4, status: "payment_pending", payment: { provider: "manual", status: "pending" },
    inventory: {
      status: "held", totalCycles: 4, committedCycles: 0,
      items: [{ sku: "KANJI", quantityPerCycle: 6, reservedQuantity: 24, committedQuantity: 0 }],
    },
    save: async () => {},
  };
  const session = { withTransaction: async callback => callback(), endSession: async () => {} };
  const { markManualOrderPaid } = load("../libs/inventory.js", {
    mongoose: { startSession: async () => session },
    OrderPlan: { findById: () => ({ session: async () => order }) },
    Sku: { find: () => ({ session: async () => [] }), findOne: () => ({ session: async () => null }) },
  }, ["markManualOrderPaid"]);
  order.source = "landing";
  await assert.rejects(markManualOrderPaid({ orderPlanId: order.id }), { code: "INVALID_INVENTORY_ACTION" });
  order.source = "admin";
  const paid = await markManualOrderPaid({ orderPlanId: order.id });
  assert.equal(paid.status, "active");
  assert.equal(paid.payment.status, "paid");
  assert.equal(paid.payment.paidCount, 4);
  assert.equal(paid.payment.remainingCount, 0);
  assert.equal(paid.inventory.status, "committed");
  assert.equal(paid.inventory.committedCycles, 4);
  assert.equal(paid.inventory.items[0].committedQuantity, 24);
  assert.equal(paid.inventory.items[0].reservedQuantity, 0);
  await assert.rejects(markManualOrderPaid({ orderPlanId: order.id }), { code: "INVALID_INVENTORY_ACTION" });
});

test("public one-time checkout continues to create the original Razorpay checkout token", async () => {
  const fixture = creationFixture();
  fixture.state.body = { mode: "one_time" };
  const response = await fixture.POST({});
  assert.equal(response.body.checkoutToken, "public_checkout_token");
  assert.equal(response.body.razorpay.order_id, "order_web");
  assert.equal(response.body.qrPayment, undefined);
  assert.equal(fixture.state.qrCalls, 0);
  assert.equal(fixture.state.allowMissingEmail, false);
  assert.equal(fixture.state.reservation.orderPayload.source, "landing");
});

test("QR status and cancellation endpoints deny non-admins before accessing an order", async () => {
  let admin = false;
  let reads = 0;
  const { GET, DELETE } = load("../app/api/admin/order-plans/[id]/qr/route.js", {
    NextResponse: { json }, enforceBrowserOrigin: () => null,
    getAdminSessionState: async () => ({ session: { user: {} }, isAdmin: admin }),
    connectMongo: async () => {}, OrderPlan: { findById: async () => { reads++; return createOrder(); } },
    isAdminQrOrder: () => true, syncAdminOrderQrPayment: async order => order,
  }, ["GET", "DELETE"]);
  const context = { params: { id: createOrder().id } };
  assert.equal((await GET({}, context)).status, 403);
  assert.equal((await DELETE({}, context)).status, 403);
  assert.equal(reads, 0);
  admin = true;
  assert.equal((await GET({}, { params: { id: "invalid" } })).status, 400);
  assert.equal((await GET({}, context)).status, 200);
});

test("signed QR webhooks reconcile the stored QR even without a Razorpay order ID; forged events are rejected", async () => {
  let validSignature = false;
  let reconciled = 0;
  const order = createOrder();
  const { POST } = load("../app/api/webhook/razorpay/route.js", {
    NextResponse: { json }, headers: () => new Headers({ "x-razorpay-signature": "signature" }),
    verifyRazorpayWebhookSignature: () => validSignature, connectMongo: async () => {},
    Sku: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    buildSeasonalCutoffMapFromCatalog: () => new Map(),
    OrderPlan: { findOne: async query => { assert.equal(query["payment.qrCodeId"], "qr_test"); return order; } },
    isAdminQrOrder: value => value === order,
    syncAdminOrderQrPayment: async value => { assert.equal(value, order); reconciled++; },
  }, ["POST"]);
  const request = { text: async () => JSON.stringify({ event: "qr_code.credited", payload: { qr_code: { entity: { id: "qr_test" } }, payment: { entity: { ...captured(), order_id: null } } } }) };
  assert.equal((await POST(request)).status, 400);
  assert.equal(reconciled, 0);
  validSignature = true;
  assert.equal((await POST(request)).status, 200);
  assert.equal(reconciled, 1);
});
