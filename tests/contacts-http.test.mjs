import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const base = process.env.PUBLIC_TEST_URL;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
test("public PY/BR identity and WhatsApp aliases share canonical contacts", { skip: !(base && api && secret && process.env.CONTACT_HTTP_TEST === "true") }, async () => {
  const db = createClient(api, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const menuResponse = await fetch(`${base}/api/public/menu`);
  assert.equal(menuResponse.status, 200);
  const menu = await menuResponse.json();
  assert.equal(menu.settings.default_phone_country, "PY");
  assert.ok(menu.products.length);
  const method = menu.payment_configuration.enabled_methods.find((value) => value !== "pix");
  assert.ok(method, "Enable a non-Pix method for this test");
  const pyLocal = `981${randomInt(100000, 999999)}`;
  const brLegacyLocal = `11${randomInt(60000000, 69999999)}`;
  const py = `+595${pyLocal}`, br = `+55${brLegacyLocal.slice(0, 2)}9${brLegacyLocal.slice(2)}`;
  const legacy = `+55${brLegacyLocal}`;
  const requestId = randomUUID();
  const orderIds = [];
  const customerIds = [];
  for (const phone of [py, br]) {
    const existing = await db.from("customers").select("id").eq("phone", phone);
    assert.ifError(existing.error); assert.equal(existing.data.length, 0, "Test phone already exists; rerun with a new random phone");
    const conversation = await db.from("whatsapp_conversations").select("phone").eq("phone", phone);
    assert.ifError(conversation.error); assert.equal(conversation.data.length, 0);
  }
  try {
    for (const [phone, country] of [[`0${pyLocal}`, "PY"], [py, "PY"], [brLegacyLocal, "BR"], [br, "BR"]]) {
      const response = await fetch(`${base}/api/public/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_type: "pickup", customer_name: "__contacts_http__", customer_phone: phone, phone_country: country, payment_method: method, items: [{ product_id: menu.products[0].id, quantity: 1 }] }) });
      assert.equal(response.status, 201, await response.clone().text());
      const body = await response.json();
      const order = await db.from("orders").select("id,customer_id,customer_phone").eq("public_token", body.tracking_path.split("/").pop()).single();
      assert.ifError(order.error); orderIds.push(order.data.id); customerIds.push(order.data.customer_id);
      assert.equal(order.data.customer_phone, country === "PY" ? py : br);
    }
    assert.equal(customerIds[0], customerIds[1]); assert.equal(customerIds[2], customerIds[3]);
    const invalid = await fetch(`${base}/api/public/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_type: "pickup", customer_name: "Invalid", customer_phone: "abc981123456", payment_method: method, items: [{ product_id: menu.products[0].id, quantity: 1 }] }) });
    assert.equal(invalid.status, 400);
    async function webhook(from, id) {
      const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID }, messages: [{ id, from: from.replace(/^\+/, ""), timestamp: String(Math.floor(Date.now() / 1000)), text: { body: "menu" } }] } }] }] });
      const signature = `sha256=${createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(body).digest("hex")}`;
      const response = await fetch(`${base}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signature }, body });
      assert.equal(response.status, 200);
      const processed = await fetch(`${base}/api/whatsapp/process`, { method: "POST", headers: { authorization: `Bearer ${process.env.WHATSAPP_WORKER_SECRET}` } });
      assert.equal(processed.status, 200);
      // The webhook's after() worker may hold the lease while /process returns.
      // Wait for committed transport identity instead of racing that worker.
      let committed = false;
      for (let attempt = 0; attempt < 25; attempt++) {
        const current = await db.from("whatsapp_conversations").select("provider_recipient").eq("phone", br).maybeSingle();
        assert.ifError(current.error);
        if (current.data?.provider_recipient === from.replace(/^\+/, "")) { committed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.ok(committed, "WhatsApp transport identity was not committed within the bounded deadline");
    }
    await webhook(legacy, `contact:${requestId}:1`);
    await webhook(legacy, `contact:${requestId}:1`);
    const first = await db.from("whatsapp_conversations").select("phone,provider_recipient").eq("phone", br).single();
    assert.ifError(first.error); assert.equal(first.data.provider_recipient, legacy.slice(1));
    await webhook(br, `contact:${requestId}:2`);
    const conversation = await db.from("whatsapp_conversations").select("phone,provider_recipient").eq("phone", br).single();
    assert.ifError(conversation.error); assert.equal(conversation.data.provider_recipient, br.slice(1));
    const messages = await db.from("whatsapp_messages").select("id,phone").like("wa_message_id", `contact:${requestId}:%`).eq("direction", "in");
    assert.ifError(messages.error); assert.equal(messages.data.length, 2); assert.ok(messages.data.every((row) => row.phone === br));
    const simulated = await fetch(`${base}/api/whatsapp/simulate`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WHATSAPP_WORKER_SECRET}` }, body: JSON.stringify({ phone: `0${pyLocal}`, phone_country: "PY", message_id: `contact:${requestId}:sim`, text: "menu" }) });
    assert.equal(simulated.status, 200);
    const pyConversation = await db.from("whatsapp_conversations").select("phone,provider_recipient").eq("phone", py).single();
    assert.ifError(pyConversation.error); assert.equal(pyConversation.data.provider_recipient, py.slice(1));
  } finally { /* Fixture history is removed with the temporary instance. */ }
});
