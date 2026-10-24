import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

test("public checkout persists the delivery map pin with its address", { skip: !(base && api && secret) }, async (t) => {
  const db = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const productId = randomUUID(), categoryId = randomUUID();
  const phone = `+5511${randomInt(900000000, 999999999)}`;
  assert.equal((await db.from("customers").select("id", { count: "exact", head: true }).eq("phone", phone)).count, 0);
  t.after(async () => {
    const customers = await db.from("customers").select("id").eq("phone", phone);
    assert.ifError(customers.error);
    for (const customer of customers.data) {
      assert.ifError((await db.from("orders").delete().eq("customer_id", customer.id)).error);
      assert.ifError((await db.from("customer_addresses").delete().eq("customer_id", customer.id)).error);
      assert.ifError((await db.from("customers").delete().eq("id", customer.id)).error);
    }
    assert.ifError((await db.from("products").delete().eq("id", productId)).error);
    assert.ifError((await db.from("categories").delete().eq("id", categoryId)).error);
  });
  const settings = await db.from("restaurant_settings").select("min_delivery_order, is_accepting_orders, delivery_enabled").eq("id", true).single();
  assert.ifError(settings.error);
  assert.ok(settings.data.is_accepting_orders && settings.data.delivery_enabled);
  assert.ifError((await db.from("categories").insert({ id: categoryId, name: "__location_test__" })).error);
  assert.ifError((await db.from("products").insert({ id: productId, category_id: categoryId, name: "__location_test__", price: Math.max(30, Math.ceil(settings.data.min_delivery_order)) })).error);
  const location = "https://www.google.com/maps/search/?api=1&query=-23.550520,-46.633308";
  const payload = { order_type: "delivery", customer_name: "__location_test__", customer_phone: phone, payment_method: "pix", items: [{ product_id: productId, quantity: 1, notes: "" }], delivery_address: { street: "Rua Teste", number: "10", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001000", location_url: location } };
  const send = (body) => fetch(`${base}/api/public/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await send({ ...payload, delivery_address: { ...payload.delivery_address, location_url: "javascript:alert(1)" } })).status, 400);
  const result = await send(payload);
  assert.equal(result.status, 201, await result.clone().text());
  const created = await result.json();
  const order = await db.from("orders").select("delivery_address, status").eq("public_token", created.tracking_path.split("/").at(-1)).single();
  assert.ifError(order.error);
  assert.equal(order.data.delivery_address.location_url, location);
  assert.equal(order.data.delivery_address.number, "10");
  assert.equal(order.data.status, "pending_confirmation");
  const locationOnly = { ...payload, delivery_address: { location_url: location, reference: "Portão azul" } };
  const locationResponse = await send(locationOnly);
  assert.equal(locationResponse.status, 201, await locationResponse.clone().text());
  const locationOrder = await locationResponse.json();
  const stored = await db.from("orders").select("delivery_address").eq("public_token", locationOrder.tracking_path.split("/").at(-1)).single();
  assert.ifError(stored.error);
  assert.equal(stored.data.delivery_address.street, "");
  assert.equal(stored.data.delivery_address.reference, "Portão azul");
  assert.equal(stored.data.delivery_address.location_url, location);
  assert.equal((await send({ ...payload, delivery_address: {} })).status, 400);
  const invalidRpc = await db.rpc("create_customer_order", { p_payload: { ...payload, source: "web", delivery_address: { location_url: "https://evil.test" } } });
  assert.ok(invalidRpc.error, "Database also rejects invalid map-only destinations");
  const missingRpc = await db.rpc("create_customer_order", { p_payload: { ...payload, source: "web", delivery_address: {} } });
  assert.ok(missingRpc.error, "Database also rejects missing destinations");
  const customer = await db.from("customers").select("id").eq("phone", phone).single();
  assert.ifError(customer.error);
  const addresses = await db.from("customer_addresses").select("street").eq("customer_id", customer.data.id);
  assert.ifError(addresses.error);
  assert.deepEqual(addresses.data.map((entry) => entry.street), ["Rua Teste"]);
});
