import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.PUBLIC_TEST_URL;

test("public table page renders without login or Supabase credentials", { skip: !base }, async () => {
  const response = await fetch(`${base}/t/invalid?src=nfc`);
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("customer-page"));
});

test("all public endpoints reject malformed tokens without database access", { skip: !base }, async () => {
  for (const [path, method] of [
    ["/api/public/tables/invalid", "GET"],
    ["/api/public/tables/invalid/orders", "POST"],
    ["/api/public/tables/invalid/requests", "POST"],
    ["/api/public/tables/invalid/status?order=bad", "GET"],
  ]) {
    const response = await fetch(`${base}${path}`, { method });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match((await response.json()).error, /QR inv/);
  }
});
