import assert from "node:assert/strict";
import test from "node:test";
import { createServerClient } from "@supabase/ssr";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
async function login(email) {
  const cookies = new Map();
  const db = createServerClient(api, key, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
  } });
  assert.ifError((await db.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD || "Demo@12345" })).error);
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

test("only admin can resolve a restaurant map link in Settings", { skip: !(base && api && key) }, async () => {
  const post = (location_url, cookie = "") => fetch(`${base}/api/staff/restaurant-location`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ location_url }) });
  const link = "https://www.google.com/maps/search/?api=1&query=-25.235038,-57.536561";
  assert.equal((await post(link)).status, 401);
  const [admin, cashier] = await Promise.all([login("admin@restaurante.local"), login("caixa@restaurante.local")]);
  assert.equal((await post(link, cashier)).status, 403);
  assert.equal((await post("http://127.0.0.1:54323/", admin)).status, 400);
  const response = await post(link, admin);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { latitude: -25.235038, longitude: -57.536561 });
  const page = await fetch(`${base}/admin/settings`, { headers: { cookie: admin } });
  assert.equal(page.status, 200);
  await page.text();
  if (process.env.RESTAURANT_SHORT_LINK_TEST) {
    const short = await post(process.env.RESTAURANT_SHORT_LINK_TEST, admin);
    assert.equal(short.status, 200, await short.clone().text());
    assert.deepEqual(await short.json(), { latitude: -25.235038, longitude: -57.536561 });
  }
});
