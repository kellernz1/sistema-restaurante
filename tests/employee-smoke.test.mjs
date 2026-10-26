import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = !!(base && api && key && secret);
const password = "Employee@Test123";

async function login(email, accountPassword = process.env.DEMO_PASSWORD || "Demo@12345") {
  const cookies = new Map();
  const db = createServerClient(api, key, { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)) } });
  const signed = await db.auth.signInWithPassword({ email, password: accountPassword }); assert.ifError(signed.error);
  return { db, id: signed.data.user.id, cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
}
async function mutate(path, body, cookie = "", method = "PATCH") {
  return fetch(base + path, { method, headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("employee accounts require administrator access", { skip: !base }, async () => {
  assert.equal((await fetch(`${base}/api/staff/employees`)).status, 401);
  assert.equal((await mutate("/api/staff/employees", {}, "", "POST")).status, 401);
});

test("employee lifecycle preserves role boundaries and blocks existing sessions", { skip: !live }, async (t) => {
  const service = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const policy=await service.from("service_policy").select("uses_waiter").single();assert.ifError(policy.error);
  t.after(async()=>{assert.ifError((await service.from("service_policy").update({uses_waiter:policy.data.uses_waiter}).eq("id",true)).error);});
  assert.ifError((await service.from("service_policy").update({uses_waiter:true}).eq("id",true)).error);
  const [admin, cashier] = await Promise.all([login("admin@restaurante.local"), login("caixa@restaurante.local")]);
  assert.equal((await fetch(`${base}/api/staff/employees`, { headers: { cookie: cashier.cookie } })).status, 403);
  assert.equal((await mutate("/api/staff/employees", {}, cashier.cookie, "POST")).status, 403);
  assert.equal((await mutate(`/api/staff/employees/${admin.id}`, { is_active: false }, admin.cookie)).status, 409);
  assert.equal((await mutate(`/api/staff/employees/${admin.id}`, { full_name: "Test", role: "waiter" }, admin.cookie)).status, 409);
  const ids = [];
  // Keep users referenced by immutable audit events until instance disposal.
  const accounts = new Map();
  for (const role of ["waiter", "cashier", "kitchen", "admin"]) {
    const email = `employee-test-${randomUUID()}@restaurante.local`;
    const response = await mutate("/api/staff/employees", { full_name: `Employee ${role}`, email, password, role }, admin.cookie, "POST");
    assert.equal(response.status, 201, await response.clone().text());
    const body = await response.json(); ids.push(body.employee.id);
    assert.equal(body.employee.role, role); assert.equal(body.employee.is_active, true);
    assert.equal(JSON.stringify(body).includes(password), false);
    const session = await login(email, password);
    const effective = await session.db.rpc("current_user_role"); assert.ifError(effective.error); assert.equal(effective.data, role);
    accounts.set(role, { ...body.employee, session });
    const duplicate = await mutate("/api/staff/employees", { full_name: "Duplicate", email, password, role }, admin.cookie, "POST");
    assert.equal(duplicate.status, 409);
  }
  const target = accounts.get("cashier");
  assert.equal((await mutate(`/api/staff/employees/${target.id}`, { is_active: false }, admin.cookie)).status, 200);
  assert.equal((await fetch(`${base}/api/staff/products`, { headers: { cookie: target.session.cookie } })).status, 403);
  assert.equal((await mutate("/api/staff/orders", {}, target.session.cookie, "POST")).status, 403);
  const hidden = await target.session.db.from("products").select("id"); assert.ifError(hidden.error); assert.equal(hidden.data.length, 0);
  assert.equal((await target.session.db.rpc("current_user_role")).data, null);
  assert.ok((await target.session.db.rpc("open_table", { p_table_id: randomUUID() })).error);
  assert.ok((await target.session.db.rpc("close_order", { p_order_id: randomUUID(), p_payment_method: "pix" })).error);
  const blockedPage = await fetch(`${base}/cashier`, { headers: { cookie: target.session.cookie }, redirect: "manual" });
  assert.equal(blockedPage.status, 307); assert.ok(blockedPage.headers.get("location").endsWith("/unauthorized"));
  assert.equal((await mutate(`/api/staff/employees/${target.id}`, { is_active: true }, admin.cookie)).status, 200);
  assert.equal((await target.session.db.rpc("current_user_role")).data, "cashier");
  const changed = await mutate(`/api/staff/employees/${target.id}`, { full_name: "Employee changed", role: "waiter" }, admin.cookie);
  assert.equal(changed.status, 200); assert.equal((await target.session.db.rpc("current_user_role")).data, "waiter");

  const email = `employee-test-${randomUUID()}@restaurante.local`;
  const inactive = await mutate("/api/staff/employees", { full_name: "Inactive employee", email, password, role: "waiter", is_active: false }, admin.cookie, "POST");
  assert.equal(inactive.status, 201); const inactiveId = (await inactive.json()).employee.id; ids.push(inactiveId);
  const client = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ok((await client.auth.signInWithPassword({ email, password })).error);
  assert.equal((await mutate(`/api/staff/employees/${inactiveId}`, { is_active: true }, admin.cookie)).status, 200);
  await login(email, password);
  const list = await fetch(`${base}/api/staff/employees`, { headers: { cookie: admin.cookie } });
  assert.equal(list.status, 200); const data = await list.json(); assert.ok(data.employees.some((employee) => employee.id === inactiveId));
  for (const employee of data.employees) assert.deepEqual(Object.keys(employee).sort(), ["created_at", "email", "full_name", "id", "is_active", "role"]);
  const page = await fetch(`${base}/admin/settings/employees`, { headers: { cookie: admin.cookie } });
  assert.equal(page.status, 200); assert.ok((await page.text()).includes("initialEmployees"));
});
