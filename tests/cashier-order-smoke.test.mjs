import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = !!(base && api && key && secret);

async function cookieLogin(email) {
  const cookies = new Map();
  const client = createServerClient(api, key, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
  } });
  const result = await client.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD || "Demo@12345" });
  assert.ifError(result.error);
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function post(path, payload, cookie = "") {
  return fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(payload) });
}

test("cashier creation requires staff authentication", { skip: !base }, async () => {
  assert.equal((await post("/api/staff/orders", {})).status, 401);
});

test("cashier can submit all channels and retries do not duplicate kitchen items", { skip: !live }, async (t) => {
  const admin = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const [cashier, waiter, kitchen] = await Promise.all([
    cookieLogin("caixa@restaurante.local"), cookieLogin("garcom@restaurante.local"), cookieLogin("cozinha@restaurante.local"),
  ]);
  assert.equal((await post("/api/staff/orders", {}, waiter)).status, 403);
  assert.equal((await post("/api/staff/orders", {}, kitchen)).status, 403);
  assert.equal((await post("/api/staff/orders", {}, cashier)).status, 400);
  const page = await fetch(`${base}/cashier/orders/new`, { headers: { cookie: cashier }, redirect: "manual" });
  assert.equal(page.status, 200);

  const categoryId = randomUUID(), productId = randomUUID(), tableId = randomUUID();
  const requestIds = [], orderIds = [], customerIds = [];
  t.after(async () => {
    if (requestIds.length) {
      const submissions = await admin.from("cashier_order_submissions").select("order_id").in("request_id", requestIds);
      assert.ifError(submissions.error);
      orderIds.push(...submissions.data.map((row) => row.order_id).filter(Boolean));
      assert.ifError((await admin.from("cashier_order_submissions").delete().in("request_id", requestIds)).error);
    }
    if (orderIds.length) {
      const orders = await admin.from("orders").select("customer_id").in("id", orderIds);
      customerIds.push(...orders.data.map((row) => row.customer_id).filter(Boolean));
      assert.ifError((await admin.from("orders").delete().in("id", orderIds)).error);
    }
    if (customerIds.length) {
      assert.ifError((await admin.from("customer_addresses").delete().in("customer_id", customerIds)).error);
      assert.ifError((await admin.from("customers").delete().in("id", customerIds)).error);
    }
    assert.ifError((await admin.from("tables").delete().eq("id", tableId)).error);
    assert.ifError((await admin.from("products").delete().eq("id", productId)).error);
    assert.ifError((await admin.from("categories").delete().eq("id", categoryId)).error);
  });
  const settings = await admin.from("restaurant_settings").select("*").eq("id", true).single();
  assert.ifError(settings.error);
  assert.ok(settings.data.is_accepting_orders && settings.data.pickup_enabled && settings.data.delivery_enabled, "Enable local ordering channels for this smoke test");
  const price = Math.max(12.35, Math.ceil(settings.data.min_delivery_order));
  assert.ifError((await admin.from("categories").insert({ id: categoryId, name: "__cashier_http_test__" })).error);
  assert.ifError((await admin.from("products").insert({ id: productId, category_id: categoryId, name: "__cashier_http_product__", price })).error);
  assert.ifError((await admin.from("tables").insert({ id: tableId, table_number: randomInt(700000, 800000), capacity: 2 })).error);
  const items = [{ product_id: productId, quantity: 2, notes: "HTTP test" }];
  const tableRequest = { request_id: randomUUID(), payload: { order_type: "dine_in", table_id: tableId, items } };
  requestIds.push(tableRequest.request_id);
  const responses = await Promise.all([post("/api/staff/orders", tableRequest, cashier), post("/api/staff/orders", tableRequest, cashier)]);
  for (const response of responses) assert.equal(response.status, 201, await response.clone().text());
  const tableOrders = await Promise.all(responses.map((response) => response.json()));
  assert.equal(tableOrders[0].order_id, tableOrders[1].order_id);
  const stored = await admin.from("order_items").select("id", { count: "exact" }).eq("order_id", tableOrders[0].order_id);
  assert.ifError(stored.error); assert.equal(stored.count, 1);
  assert.equal(tableOrders[0].total_amount, price * 2);
  const phone = `+5511${randomInt(900000000, 999999999)}`;
  assert.equal((await admin.from("customers").select("id", { count: "exact", head: true }).eq("phone", phone)).count, 0);
  for (const type of ["pickup", "delivery"]) {
    const request = { request_id: randomUUID(), payload: { order_type: type, customer_name: "__cashier_http_customer__", customer_phone: phone,
      payment_method: "pix", items, ...(type === "delivery" ? { delivery_address: { street: "Rua Teste", number: "10", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001000" } } : {}) } };
    requestIds.push(request.request_id);
    const response = await post("/api/staff/orders", request, cashier);
    assert.equal(response.status, 201, await response.clone().text());
    const order = await response.json();
    assert.equal(order.total_amount, price * 2 + (type === "delivery" ? settings.data.delivery_fee : 0));
    const item = await admin.from("order_items").select("id").eq("order_id", order.order_id).single();
    assert.ifError(item.error);
    for (const [expected, status] of [["pending", "preparing"], ["preparing", "ready"]]) {
      assert.equal((await post(`/api/staff/items/${item.data.id}/status`, { expected, status }, kitchen)).status, 200);
    }
    if (type === "delivery") assert.equal((await post(`/api/staff/orders/${order.order_id}/transition`, { action: "dispatch" }, cashier)).status, 200);
    assert.equal((await post(`/api/staff/orders/${order.order_id}/transition`, { action: "complete", payment_method: "pix" }, cashier)).status, 200);
    const completed = await admin.from("orders").select("status, payment_status").eq("id", order.order_id).single();
    assert.ifError(completed.error); assert.equal(completed.data.status, "closed"); assert.equal(completed.data.payment_status, "paid");
  }
});
