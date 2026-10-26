import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = !!(base && api && key && secret);

async function login(email) {
  const cookies = new Map();
  const db = createServerClient(api, key, { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)) } });
  assert.ifError((await db.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD || "Demo@12345" })).error);
  return { db, cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
}

async function mutate(path, method, body, cookie = "") {
  return fetch(`${base}${path}`, { method, headers: { cookie, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
}

test("menu management requires administrator access", { skip: !base }, async () => {
  assert.equal((await fetch(`${base}/api/staff/products`)).status, 401);
  assert.equal((await mutate("/api/staff/products", "POST", {})).status, 401);
});

test("administrator manages photos and availability without changing order history", { skip: !live }, async (t) => {
  const service = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const [admin, cashier] = await Promise.all([login("admin@restaurante.local"), login("caixa@restaurante.local")]);
  assert.equal((await fetch(`${base}/api/staff/products`, { headers: { cookie: cashier.cookie } })).status, 403);
  assert.equal((await mutate("/api/staff/products", "POST", {}, cashier.cookie)).status, 403);
  const categoryId = randomUUID(), requestId = randomUUID();
  let productId, orderId;
  t.after(async () => {assert.ifError((await service.from("products").update({is_active:false}).eq("category_id",categoryId)).error);});
  assert.ifError((await service.from("categories").insert({ id: categoryId, name: `__menu_http_test__${categoryId}` })).error);
  const fields = { name: "__menu_test_dish__", category_id: categoryId, price: 12350, description: "Test dish", is_active: true };
  const response = await mutate("/api/staff/products", "POST", fields, admin.cookie);
  assert.equal(response.status, 201, await response.clone().text());
  let product = (await response.json()).product; productId = product.id;
  const path = `/api/staff/products/${productId}`;
  const photoPath = `${path}/photo`;
  assert.equal((await mutate(path, "DELETE", undefined, cashier.cookie)).status, 403);
  assert.equal((await mutate(photoPath, "POST", new FormData(), cashier.cookie)).status, 403);
  assert.ok((await cashier.db.rpc("set_product_photo", { p_product_id: productId, p_content: "AAAA" })).error);
  assert.ok((await cashier.db.from("product_photos").select("*")).error);
  assert.equal((await mutate(path, "PATCH", { image_version: randomUUID() }, admin.cookie)).status, 400);

  const image = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 20, g: 120, b: 200 } } }).png().toBuffer();
  const upload = async () => {
    const form = new FormData(); form.set("photo", new File([image], "dish.png", { type: "image/png" }));
    const result = await mutate(photoPath, "POST", form, admin.cookie);
    assert.equal(result.status, 200, await result.clone().text());
    return (await result.json()).image_version;
  };
  const firstVersion = await upload();
  const imageUrl = `/api/public/products/${productId}/image?v=${firstVersion}`;
  const photo = await fetch(base + imageUrl);
  assert.equal(photo.status, 200); assert.equal(photo.headers.get("content-type"), "image/webp");
  assert.equal(photo.headers.get("x-content-type-options"), "nosniff");
  const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
  assert.equal(metadata.format, "webp"); assert.ok(metadata.width <= 1200 && metadata.height <= 900);
  assert.equal((await fetch(base + imageUrl, { headers: { "if-none-match": photo.headers.get("etag") } })).status, 304);
  const bad = new FormData(); bad.set("photo", new File(["<svg><script>alert(1)</script></svg>"], "fake.png", { type: "image/png" }));
  assert.equal((await mutate(photoPath, "POST", bad, admin.cookie)).status, 415);
  const menu = await (await fetch(`${base}/api/public/menu`)).json();
  assert.equal(menu.products.find((entry) => entry.id === productId).image_version, firstVersion);
  assert.equal((await mutate(photoPath, "DELETE", undefined, admin.cookie)).status, 200);
  assert.equal((await fetch(base + imageUrl)).status, 404);
  const secondVersion = await upload(); assert.notEqual(secondVersion, firstVersion);

  const phone = `+5511${randomInt(900000000, 999999999)}`;
  assert.equal((await service.from("customers").select("id", { count: "exact", head: true }).eq("phone", phone)).count, 0);
  const order = await mutate("/api/staff/orders", "POST", { request_id: requestId, payload: {
    order_type: "pickup", customer_name: "__menu_test_customer__", customer_phone: phone, payment_method: "pix", items: [{ product_id: productId, quantity: 2 }],
  } }, admin.cookie);
  assert.equal(order.status, 201, await order.clone().text()); orderId = (await order.json()).order_id;
  assert.equal((await mutate(path, "PATCH", { price: 99900, is_active: false }, admin.cookie)).status, 200);
  const unavailable = await (await fetch(`${base}/api/public/menu`)).json();
  assert.equal(unavailable.products.some((entry) => entry.id === productId), false);
  const removed = await mutate(path, "DELETE", undefined, admin.cookie);
  assert.equal(removed.status, 200); product = (await removed.json()).product;
  assert.equal(product.is_archived, true); assert.equal(product.is_active, false);
  const history = await service.from("order_items").select("unit_price, product_id").eq("order_id", orderId).single();
  assert.ifError(history.error); assert.equal(history.data.unit_price, 12350); assert.equal(history.data.product_id, productId);
  assert.equal((await mutate(path, "PATCH", { is_active: true }, admin.cookie)).status, 409);
  const restored = await mutate(path, "PATCH", { action: "restore" }, admin.cookie);
  assert.equal(restored.status, 200); assert.equal((await restored.json()).product.is_active, false);
  assert.equal((await mutate(path, "PATCH", { is_active: true }, admin.cookie)).status, 200);
  const available = await (await fetch(`${base}/api/public/menu`)).json();
  assert.equal(available.products.find((entry) => entry.id === productId).image_version, secondVersion);
});
