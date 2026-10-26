import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { distanceDeliveryFee } from "../src/features/customer-ordering/delivery-pricing.ts";
import { coordinatesMapLink } from "../src/features/customer-ordering/delivery-location.ts";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
test("road-provider contract quote is cached and charged by public checkout", { skip: !(base && api && secret && process.env.DELIVERY_ROUTE_SMOKE === "true") }, async (t) => {
  const db = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const settingsResult = await db.from("restaurant_settings").select("*").eq("id", true).single();
  assert.ifError(settingsResult.error);
  const settings = settingsResult.data;
  assert.equal(settings.delivery_fee_mode, "distance");
  assert.ok(Number.isFinite(settings.delivery_origin_latitude) && Number.isFinite(settings.delivery_origin_longitude), "Configure the restaurant delivery origin first");
  const destination = process.env.DELIVERY_ROUTE_SMOKE_LOCATION || coordinatesMapLink(settings.delivery_origin_latitude + 0.002, settings.delivery_origin_longitude + 0.002);
  // A unique valid map URL guarantees the first request reaches the local provider fixture.
  const locationUrl = new URL(destination);
  locationUrl.searchParams.set("route_test", randomUUID());
  const location = locationUrl.href;
  const post = (path, data) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const first = await post("/api/public/delivery-quote", { location_url: location });
  assert.equal(first.status, 200, await first.clone().text());
  const quote = await first.json();
  t.after(async () => assert.ifError((await db.from("delivery_quotes").delete().eq("id", quote.id)).error));
  assert.ok(Number.isFinite(quote.distance_meters) && quote.distance_meters > 0, "Expected a real route between different points");
  assert.equal(quote.fee, distanceDeliveryFee(quote.distance_meters, settings.delivery_distance_step_km, settings.delivery_distance_step_fee));
  const cached = await post("/api/public/delivery-quote", { location_url: location });
  assert.equal(cached.status, 200);
  assert.equal((await cached.json()).id, quote.id);
  const categoryId = randomUUID(), productId = randomUUID(), phone = `+5511${randomInt(900000000, 999999999)}`;
  const staffRequestId = randomUUID();
  assert.equal((await db.from("customers").select("id", { count: "exact", head: true }).eq("phone", phone)).count, 0);
  // The disposable instance owns fixture cleanup; immutable history is retained.
  const price = Math.max(30, Math.ceil(settings.min_delivery_order));
  assert.ifError((await db.from("categories").insert({ id: categoryId, name: "__route_test__" })).error);
  assert.ifError((await db.from("products").insert({ id: productId, category_id: categoryId, name: "__route_test__", price })).error);
  const payload = { order_type: "delivery", customer_name: "__route_test__", customer_phone: phone, payment_method: "pix", items: [{ product_id: productId, quantity: 1 }], delivery_address: { location_url: location, delivery_quote_id: quote.id } };
  const invalid = await post("/api/public/orders", { ...payload, delivery_fee: 0 });
  assert.equal(invalid.status, 400);
  const response = await post("/api/public/orders", payload);
  assert.equal(response.status, 201, await response.clone().text());
  const created = await response.json();
  const order = await db.from("orders").select("delivery_fee,total_amount,delivery_address").eq("public_token", created.tracking_path.split("/").at(-1)).single();
  assert.ifError(order.error);
  assert.equal(order.data.delivery_fee, quote.fee);
  assert.equal(order.data.total_amount, price + quote.fee);
  assert.equal(order.data.delivery_address.delivery_distance_meters, quote.distance_meters);
  const cookies = new Map();
  const cashier = createServerClient(api, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
  } });
  assert.ifError((await cashier.auth.signInWithPassword({ email: "caixa@restaurante.local", password: process.env.DEMO_PASSWORD || "Demo@12345" })).error);
  const sendStaff = () => fetch(`${base}/api/staff/orders`, { method: "POST", headers: { "content-type": "application/json", cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") }, body: JSON.stringify({ request_id: staffRequestId, payload }) });
  const staffResponse = await sendStaff();
  assert.equal(staffResponse.status, 201, await staffResponse.clone().text());
  const staffOrder = await staffResponse.json();
  assert.equal(staffOrder.total_amount, price + quote.fee);
  const retry = await sendStaff();
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).order_id, staffOrder.order_id);
  console.log(`Verified route: ${quote.distance_meters} m, delivery fee ${quote.fee}.`);
});
