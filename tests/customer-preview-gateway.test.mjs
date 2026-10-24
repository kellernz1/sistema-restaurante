import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { allowCustomerPreview, createCustomerPreviewGateway } from "../scripts/local/customer-preview-gateway.mjs";

test("preview exposes only customer routes and static assets", () => {
  for (const path of ["/order", "/api/public/menu", `/track/${"a".repeat(64)}`, `/api/public/orders/${"b".repeat(64)}`, "/_next/static/chunks/app.js", "/_next/static/chunks/app.css"]) assert.equal(allowCustomerPreview("GET", path), true, path);
  assert.equal(allowCustomerPreview("POST", "/api/public/orders"), true);
  assert.equal(allowCustomerPreview("POST", "/api/public/delivery-quote"), true);
  for (const path of ["/admin", "/login", "/dev/whatsapp", "/api/staff/products", "/api/staff/kitchen-print", `/print/kitchen/${"a".repeat(36)}`, "/api/whatsapp/simulate", "/api/public/tables/abc", "/auth/v1/token", "/_next/static/../server.js", "/_next/static/app.js.map", "/%61dmin", "//admin", "/order/../admin", "/order\\..\\admin"]) {
    for (const method of ["GET", "POST"]) assert.equal(allowCustomerPreview(method, path), false, `${method} ${path}`);
  }
  assert.equal(allowCustomerPreview("POST", "/order"), false);
  assert.equal(allowCustomerPreview("DELETE", "/api/public/orders"), false);
});

test("gateway replaces an HTML API failure with JSON and never repeats the POST", async () => {
  let calls = 0;
  const upstream = http.createServer((req, res) => {
    calls += 1;
    assert.equal(req.headers.cookie, undefined);
    res.writeHead(503, { "content-type": "text/html" });
    res.end("<!DOCTYPE html><h1>Temporarily unavailable</h1>");
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const gateway = createCustomerPreviewGateway(upstream.address().port);
  await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/api/public/orders`, { method: "POST", headers: { "content-type": "application/json", cookie: "staff=private" }, body: "{}" });
    assert.equal(response.status, 502);
    assert.ok(response.headers.get("content-type").includes("application/json"));
    assert.match((await response.json()).error, /antes de reenviar/);
    assert.equal(calls, 1);
  } finally {
    await Promise.all([new Promise((resolve) => gateway.close(resolve)), new Promise((resolve) => upstream.close(resolve))]);
  }
});
