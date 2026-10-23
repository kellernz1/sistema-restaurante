import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const base = process.env.PUBLIC_TEST_URL;
test("WhatsApp webhook rejects invalid signatures without database access", { skip: !base }, async () => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=ff" }, body: "{}" });
  assert.equal(response.status, 401);
});
test("WhatsApp worker requires a secret and simulator is absent from production", { skip: !base }, async () => {
  assert.equal((await fetch(`${base}/api/whatsapp/process`, { method: "POST" })).status, 403);
  assert.equal((await fetch(`${base}/api/whatsapp/simulate`, { method: "POST" })).status, 404);
});
test("WhatsApp verification handshake returns the exact challenge", { skip: !base || !process.env.WEBHOOK_TEST_TOKEN }, async () => {
  const response = await fetch(`${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(process.env.WEBHOOK_TEST_TOKEN)}&hub.challenge=test-challenge`);
  assert.equal(response.status, 200); assert.equal(await response.text(), "test-challenge");
  assert.equal((await fetch(`${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=incorrect&hub.challenge=x`)).status, 403);
});
test("signed malformed JSON is rejected after signature verification", { skip: !base || !process.env.WEBHOOK_TEST_SECRET }, async () => {
  const raw = "{";
  const signature = `sha256=${createHmac("sha256", process.env.WEBHOOK_TEST_SECRET).update(raw).digest("hex")}`;
  const response = await fetch(`${base}/api/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature }, body: raw });
  assert.equal(response.status, 400);
});
