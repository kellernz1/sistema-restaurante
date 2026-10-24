import assert from "node:assert/strict";
import test from "node:test";
import { CustomerApiError, customerApi } from "../src/features/customer-ordering/public-client.ts";

test("customer API handles HTML outages and malformed JSON without resending orders", async (t) => {
  let calls = 0;
  const mock = t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response('<!DOCTYPE html><h1>Bad gateway</h1>', { status: 502, headers: { "content-type": "text/html" } }); });
  await assert.rejects(customerApi("/api/public/orders", { method: "POST", body: "{}" }), (error) => error instanceof CustomerApiError && error.status === 502 && error.message.includes("antes de enviar novamente") && !error.message.includes("DOCTYPE"));
  assert.equal(calls, 1);
  mock.mock.mockImplementation(async () => new Response('<!DOCTYPE html>', { headers: { "content-type": "application/json" } }));
  await assert.rejects(customerApi("/api/public/menu"), (error) => error instanceof CustomerApiError && error.status === 502);
});
test("customer API preserves validation errors, success and cancellation", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Confira os dados." }, { status: 400 }));
  await assert.rejects(customerApi("/api/public/orders", { method: "POST" }), (error) => error.status === 400 && error.message === "Confira os dados.");
  mock.mock.mockImplementation(async () => Response.json({ order_number: 123 }));
  assert.deepEqual(await customerApi("/api/public/orders", { method: "POST" }), { order_number: 123 });
  mock.mock.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(customerApi("/api/public/menu"), (error) => error.status === 503 && !error.message.includes("Failed to fetch"));
  const controller = new AbortController(); controller.abort();
  const abort = new DOMException("Aborted", "AbortError");
  mock.mock.mockImplementation(async () => { throw abort; });
  await assert.rejects(customerApi("/api/public/menu", { signal: controller.signal }), (error) => error === abort);
});
