import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.PUBLIC_TEST_URL;
test("pickup/delivery and tracking pages are public", { skip: !base }, async () => {
  for (const path of ["/order", "/track/invalid"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes("customer-page"));
  }
});
test("public tracking rejects malformed bearer tokens before accessing the database", { skip: !base }, async () => {
  const response = await fetch(`${base}/api/public/orders/invalid`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).error, /acompanhamento/);
});
