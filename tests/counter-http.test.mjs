import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
test("counter HTTP creation is idempotent and public tracking reveals only ticket and state", { skip: !(base && api && key && secret) }, async () => {
  const service = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const settings = await service.from("restaurant_settings").select("counter_payment_timing,is_accepting_orders").eq("id", true).single();
  assert.ifError(settings.error);
  const product = await service.from("products").select("id").eq("is_active", true).limit(1).single(); assert.ifError(product.error);
  const requestId = randomUUID(); let orderId;
  const clients = [];
  async function login(role) {
    const jar = new Map(); const db = createServerClient(api, key, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)) } });
    assert.ifError((await db.auth.signInWithPassword({ email: `${role}@restaurante.local`, password: process.env.DEMO_PASSWORD || "Demo@12345" })).error); clients.push(db);
    return { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "), "content-type": "application/json" };
  }
  try {
    assert.ifError((await service.from("restaurant_settings").update({ counter_payment_timing: "at_end", is_accepting_orders: true }).eq("id", true)).error);
    const cashier = await login("caixa");
    const payload = { request_id: requestId, payload: { name: " Ana\n María ", items: [{ product_id: product.data.id, quantity: 2, notes: "Sem cebola" }] }, lines: [] };
    const send = (headers) => fetch(`${base}/api/staff/counter`, { method: "POST", headers, body: JSON.stringify(payload) });
    const responses = await Promise.all([send(cashier), send(cashier)]);
    const result = await responses[0].json(); assert.equal(responses[0].status, 201, JSON.stringify(result));
    orderId = result.order.id;
    assert.equal(responses[1].status, 201); assert.deepEqual(await responses[1].json(), result);
    assert.equal(result.order.counter_name, "Ana María"); assert.equal(result.order.is_counter, true);
    assert.match(result.order.public_token, /^[a-f0-9]{64}$/);
    const track = await fetch(`${base}/api/public/orders/${result.order.public_token}`);
    assert.equal(track.status, 200); assert.deepEqual(await track.json(), { is_counter: true, counter_ticket: result.order.counter_ticket, status: "open" });
    assert.equal((await fetch(`${base}/api/public/orders/${result.order.counter_ticket}`)).status, 404);
    assert.equal((await fetch(`${base}/api/public/orders/${randomUUID().replaceAll("-", "").repeat(2)}`)).status, 404);
    const receipt = await fetch(`${base}${result.receipt_path}`, { headers: cashier }); assert.equal(receipt.status, 200);
    const html = await receipt.text(); assert.ok(html.includes("Comprovante não fiscal")); assert.ok(html.includes("data:image/png;base64,")); assert.ok(html.includes("Ana María"));
    const unauthenticated = await fetch(`${base}${result.receipt_path}`, { redirect: "manual" }); assert.ok([303, 307].includes(unauthenticated.status));
    assert.equal((await fetch(`${base}/api/staff/counter/${orderId}/deliver`, { method: "POST", headers: cashier })).status, 409);
    const items = await service.from("order_items").select("id").eq("order_id", orderId); assert.ifError(items.error);
    const kitchen = await login("cozinha");
    assert.ok(items.data.length > 0);
    const kitchenAction = (headers, request_id, action) => fetch(`${base}/api/staff/orders/${orderId}/kitchen`, { method: "POST", headers, body: JSON.stringify({ request_id, action }) });
    assert.equal((await kitchenAction(cashier, randomUUID(), "start")).status, 403);
    assert.equal((await kitchenAction({ "content-type": "application/json" }, randomUUID(), "start")).status, 401);
    const startId = randomUUID();
    const started = await Promise.all([kitchenAction(kitchen, startId, "start"), kitchenAction(kitchen, startId, "start")]);
    assert.equal(started[0].status, 200); assert.equal(started[1].status, 200);
    assert.deepEqual(await started[0].json(), await started[1].json());
    const finishId = randomUUID();
    assert.equal((await kitchenAction(kitchen, finishId, "ready")).status, 200);
    assert.equal((await kitchenAction(kitchen, finishId, "ready")).status, 200);
    assert.equal((await kitchenAction(kitchen, startId, "ready")).status, 409);
    const ready = await fetch(`${base}/api/public/orders/${result.order.public_token}`); assert.deepEqual(await ready.json(), { is_counter: true, counter_ticket: result.order.counter_ticket, status: "ready" });
    assert.equal((await send(kitchen)).status, 403);
    assert.equal((await send(await login("garcom"))).status, 403);
    assert.equal((await send({ "content-type": "application/json" })).status, 401);
    const admin = await login("admin"); assert.equal((await fetch(`${base}/admin`, { headers: admin })).status, 200);
  } finally {
    assert.ifError((await service.from("counter_order_submissions").delete().eq("request_id", requestId)).error);
    if (orderId) assert.ifError((await service.from("orders").delete().eq("id", orderId)).error);
    assert.ifError((await service.from("restaurant_settings").update(settings.data).eq("id", true)).error);
    for (const db of clients) await db.auth.signOut({ scope: "local" });
  }
});
