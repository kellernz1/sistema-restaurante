import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
async function login(email) {
  const cookies = new Map();
  const db = createServerClient(api, key, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
  } });
  assert.ifError((await db.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD || "Demo@12345" })).error);
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}
test("confirmation queues a kitchen ticket, manual printing stays available, and staff-only access is enforced", { skip: !(base && api && key && secret) }, async (t) => {
  const db = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const [cashier, kitchen, waiter] = await Promise.all([login("caixa@restaurante.local"), login("cozinha@restaurante.local"), login("garcom@restaurante.local")]);
  const post = (path, payload, cookie = "") => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(payload) });
  assert.equal((await fetch(`${base}/api/staff/kitchen-print`)).status, 401);
  assert.equal((await post("/api/staff/kitchen-print", { action: "claim", terminal_id: randomUUID() }, cashier)).status, 403);
  assert.equal((await fetch(`${base}/api/staff/kitchen-print`, { headers: { cookie: waiter } })).status, 403);
  const categoryId = randomUUID(), productId = randomUUID(), phone = `+5511${randomInt(900000000, 999999999)}`;
  let orderId;
  assert.equal((await db.from("customers").select("id", { head: true, count: "exact" }).eq("phone", phone)).count, 0);
  t.after(async () => {
    if (orderId) assert.ifError((await db.from("orders").delete().eq("id", orderId)).error);
    assert.ifError((await db.from("customers").delete().eq("phone", phone)).error);
    assert.ifError((await db.from("products").delete().eq("id", productId)).error);
    assert.ifError((await db.from("categories").delete().eq("id", categoryId)).error);
  });
  assert.ifError((await db.from("categories").insert({ id: categoryId, name: "__print_http__" })).error);
  assert.ifError((await db.from("products").insert({ id: productId, category_id: categoryId, name: "__print_http_product__", price: 15 })).error);
  const created = await db.rpc("create_customer_order", { p_payload: { order_type: "pickup", source: "web", customer_name: "__print_http__", customer_phone: phone, payment_method: "pix", items: [{ product_id: productId, quantity: 2, notes: "Sem cebola" }] } });
  assert.ifError(created.error); orderId = created.data.id;
  assert.equal((await db.from("kitchen_print_jobs").select("id", { head: true, count: "exact" }).eq("order_id", orderId)).count, 0);
  assert.equal((await post(`/api/staff/orders/${orderId}/transition`, { action: "accept" }, cashier)).status, 200);
  const job = await db.from("kitchen_print_jobs").select("id,status").eq("order_id", orderId).single();
  assert.ifError(job.error); assert.equal(job.data.status, "pending");
  const list = await fetch(`${base}/api/staff/kitchen-print`, { headers: { cookie: kitchen } });
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.ok(listBody.jobs.some((entry) => entry.order_id === orderId));
  assert.ok(listBody.jobs.every((entry) => !("claim_token" in entry)));
  const receipt = await fetch(`${base}/print/kitchen/${orderId}`, { headers: { cookie: kitchen } });
  assert.equal(receipt.status, 200);
  const html = await receipt.text();
  assert.ok(html.includes(`data-kitchen-ticket="${orderId}"`));
  assert.ok(html.includes("Sem cebola") && html.includes("__print_http_product__"));
  assert.equal((await fetch(`${base}/print/kitchen/${orderId}`, { redirect: "manual" })).status, 307);
  assert.equal((await post("/api/staff/kitchen-print", { action: "finish", terminal_id: randomUUID(), claim_token: randomUUID(), job_id: job.data.id }, kitchen)).status, 409);
  assert.equal((await post("/api/staff/kitchen-print", { action: "manual", order_id: orderId }, kitchen)).status, 200);
  const manual = await db.from("kitchen_print_jobs").select("status").eq("id", job.data.id).single();
  assert.ifError(manual.error); assert.equal(manual.data.status, "dispatched");
  assert.equal((await post("/api/staff/kitchen-print", { action: "manual", order_id: orderId }, cashier)).status, 200);
  assert.equal((await db.from("kitchen_print_jobs").select("id", { head: true, count: "exact" }).eq("order_id", orderId)).count, 1);
});
