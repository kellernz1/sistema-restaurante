import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { assertResult } from "../demo-data.mjs";
import { ROOT } from "../local/lib.mjs";
import {assertIntegrationEnvironment}from "../../tests/helpers/integration-guard.mjs";

const env = {...process.env};assertIntegrationEnvironment(env);
const baseUrl = (env.PUBLIC_TEST_URL || env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const password = env.DEMO_PASSWORD || "Demo@12345";
if (!baseUrl || !supabaseUrl || !publicKey || !secretKey) {
  throw new Error("Local environment is incomplete. Run `npm run local:setup` and `npm run local:start` first.");
}

const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const checks = [];
const cleanupOrderIds = [];
const smokePhones = ["+5511999990097", "+5511999990098"];

async function check(name, task) {
  try {
    await task();
    checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${name}: ${checks.at(-1).error}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function runNativeTests() {
  const files = fs.readdirSync(path.join(ROOT, "tests"))
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => path.join("tests", file));
  // HTTP suites share restaurant settings and the public menu in the local database.
  // Run files sequentially so one suite cannot consume another suite's temporary products.
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-timeout=120000", "--test-reporter=tap", ...files], {
    cwd: ROOT,
    env: { ...process.env, ...env, PUBLIC_TEST_URL: baseUrl },
    encoding: "utf8",
    stdio: "pipe",maxBuffer:20*1024*1024,
  });
  fs.writeFileSync(path.join(env.INTEGRATION_RUN_DIR,"native.tap"),result.stdout+result.stderr,"utf8");
  process.stdout.write(result.stdout+result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Native test suites exited with code ${result.status}.`);
  if(!/^# skipped 0$/m.test(result.stdout))throw new Error("Integration aggregate must not silently skip tests.");
}

async function authenticatedClient(email) {
  const client = createClient(supabaseUrl, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const session = assertResult(await client.auth.signInWithPassword({ email, password }), `login ${email}`);
  return { client, session };
}

async function cookieLogin(email) {
  const cookies = new Map();
  const client = createServerClient(supabaseUrl, publicKey, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  assertResult(await client.auth.signInWithPassword({ email, password }), `browser login ${email}`);
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function simulateWhatsApp(phone, text) {
  const response = await fetch(`${baseUrl}/api/whatsapp/simulate`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.WHATSAPP_WORKER_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ phone, text, message_id: `smoke-${Date.now()}-${Math.random()}` }),
  });
  expect(response.ok, `WhatsApp simulator returned HTTP ${response.status}`);
  const result = await response.json();
  return (result.replies ?? []).map((row) => row.payload);
}



await check("native HTTP and validation suites", async () => runNativeTests());

await check("health endpoint and database connectivity", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  expect(response.ok && body.status === "ok" && body.database === "reachable", `health returned ${response.status}`);
});

const accounts = [
  ["admin@restaurante.local", "admin", "/admin"],
  ["garcom@restaurante.local", "waiter", "/waiter"],
  ["garcom2@restaurante.local", "waiter", "/waiter"],
  ["cozinha@restaurante.local", "kitchen", "/kitchen"],
  ["caixa@restaurante.local", "cashier", "/cashier"],
];
for (const [email, role, route] of accounts) {
  await check(`login and dashboard for ${email}`, async () => {
    const cookie = await cookieLogin(email);
    const response = await fetch(`${baseUrl}/login`, { headers: { cookie }, redirect: "manual" });
    const location = response.headers.get("location");
    expect(response.status >= 300 && response.status < 400 && new URL(location, baseUrl).pathname === route, `expected redirect to ${route}, received ${location}`);
    const { client, session } = await authenticatedClient(email);
    const profile = assertResult(await client.from("profiles").select("role").eq("id", session.user.id).single(), `profile ${email}`);
    expect(profile.role === role, `expected role ${role}, received ${profile.role}`);
  });
}

let table;
let product;
await check("valid table token and friendly invalid-token response", async () => {
  table = assertResult(await admin.from("tables").select("id,qr_token").eq("table_number", 1).single(), "read table 1");
  product = assertResult(await admin.from("products").select("id").eq("is_active", true).limit(1).single(), "read product");
  expect((await fetch(`${baseUrl}/api/public/tables/${table.qr_token}`)).status === 200, "seeded table token did not return 200");
  const invalid = await fetch(`${baseUrl}/api/public/tables/invalid`);
  const body = await invalid.json();
  expect(invalid.status === 404 && /QR inv/i.test(body.error), "invalid table token did not return the friendly error");
});

let pickupOrder;
await check("pickup lifecycle reaches the kitchen", async () => {
  const response = await fetch(`${baseUrl}/api/public/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_type: "pickup", customer_name: "[SMOKE] Cliente", customer_phone: smokePhones[0], payment_method: "pix", items: [{ product_id: product.id, quantity: 1 }] }),
  });
  expect(response.status === 201, `public order returned HTTP ${response.status}`);
  const created = await response.json();
  const token = created.tracking_path.split("/").at(-1);
  pickupOrder = assertResult(await admin.from("orders").select("id,status").eq("public_token", token).single(), "read smoke pickup");
  cleanupOrderIds.push(pickupOrder.id);
  expect(pickupOrder.status === "pending_confirmation", `expected pending_confirmation, received ${pickupOrder.status}`);
  const { client: cashier } = await authenticatedClient("caixa@restaurante.local");
  const accepted = assertResult(await cashier.rpc("advance_hub_order", { p_order_id: pickupOrder.id, p_action: "accept" }), "accept smoke pickup");
  expect(accepted.status === "open", `accepted order status is ${accepted.status}`);
  const { client: kitchen } = await authenticatedClient("cozinha@restaurante.local");
  const items = assertResult(await kitchen.from("order_items").select("id,status").eq("order_id", pickupOrder.id), "kitchen item query");
  expect(items.length > 0 && items.every((item) => item.status === "pending"), "accepted items were not visible to kitchen");
  const closeAttempt = await kitchen.rpc("close_order", { p_order_id: pickupOrder.id, p_payment_method: "pix" });
  expect(Boolean(closeAttempt.error), "kitchen user was able to close a bill");
});

await check("anonymous users cannot read orders", async () => {
  const anonymous = createClient(supabaseUrl, publicKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await anonymous.from("orders").select("id").limit(1);
  expect(Boolean(result.error) || result.data?.length === 0, "anonymous order read returned data");
});

await check("WhatsApp mock menu link, web pickup and human handoff", async () => {
  expect(env.WHATSAPP_WORKER_SECRET, "WHATSAPP_WORKER_SECRET is missing");
  const replies = await simulateWhatsApp(smokePhones[1], "menu");
  const expectedLink = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/order`;
  expect(replies.some((reply) => reply.kind === "text" && reply.body.includes(expectedLink)), "bot did not return the configured public menu link");
  expect((await fetch(`${baseUrl}/order`)).status === 200, "linked menu did not open");
  const before = assertResult(await admin.from("orders").select("id").eq("customer_phone", smokePhones[1]), "check bot orders");
  expect(before.length === 0, "menu-link reply unexpectedly created an order");
  const response = await fetch(`${baseUrl}/api/public/orders`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ order_type: "pickup", customer_name: "[SMOKE] WhatsApp link", customer_phone: smokePhones[1], payment_method: "pix", items: [{ product_id: product.id, quantity: 1 }] }),
  });
  expect(response.status === 201, `linked checkout returned HTTP ${response.status}`);
  const created = await response.json();
  const order = assertResult(await admin.from("orders").select("id,status,source").eq("public_token", created.tracking_path.split("/").at(-1)).single(), "read linked checkout order");
  cleanupOrderIds.push(order.id);
  expect(order.status === "pending_confirmation" && order.source === "web", "linked checkout did not create a pending web order");
  await simulateWhatsApp(smokePhones[1], "atendente");
  const conversation = assertResult(await admin.from("whatsapp_conversations").select("needs_human").eq("phone", smokePhones[1]).single(), "read human handoff");
  expect(conversation.needs_human, "human handoff did not pause the bot");
});




const failed = checks.filter((result) => !result.passed);
console.log(`\nSmoke result: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  for (const result of failed) console.error(`- ${result.name}: ${result.error}`);
  process.exitCode = 1;
}
