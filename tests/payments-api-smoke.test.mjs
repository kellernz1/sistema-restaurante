import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
test("payment HTTP contracts expose sanitized config and enforce staff boundaries", { skip: !(base && api && key) }, async () => {
  const menuResponse = await fetch(`${base}/api/public/menu`);
  assert.equal(menuResponse.status, 200);
  const menu = await menuResponse.json();
  assert.ok(Array.isArray(menu.payment_configuration.enabled_methods));
  assert.ok(menu.products.every((product) => Number.isSafeInteger(product.price)));
  assert.equal(JSON.stringify(menu.payment_configuration).includes("created_by"), false);
  assert.equal((await fetch(`${base}/api/staff/payment-settings`)).status, 401);
  for (const [role, allowed] of [["admin", true], ["caixa", true], ["garcom", false]]) {
    const jar = new Map();
    const db = createServerClient(api, key, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)) } });
    assert.ifError((await db.auth.signInWithPassword({ email: `${role}@restaurante.local`, password: process.env.DEMO_PASSWORD || "Demo@12345" })).error);
    try {
      const headers = { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "), "content-type": "application/json" };
      assert.equal((await fetch(`${base}/api/staff/payment-settings`, { headers })).status, allowed ? 200 : 403);
      assert.equal((await fetch(`${base}/api/staff/orders/${randomUUID()}/payments`, { headers })).status, allowed ? 200 : 403);
      assert.equal((await fetch(`${base}/api/staff/payment-settings`, { method: "POST", headers, body: JSON.stringify({ rate: "0", rounding: "none" }) })).status, role === "admin" ? 400 : 403);
      assert.equal((await fetch(`${base}/api/staff/orders/${randomUUID()}/payments`, { method: "POST", headers, body: JSON.stringify({ request_id: randomUUID(), lines: [{ method: "cash", currency: "PYG", amount_pyg: 1.5, original_amount: 2 }] }) })).status, allowed ? 400 : 403);
    } finally { await db.auth.signOut({ scope: "local" }); }
  }
});
