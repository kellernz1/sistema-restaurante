import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCounterName, counterWaitTone } from "../src/features/counter/domain.ts";
import { counterRequestSchema } from "../src/features/counter/validation.ts";
test("counter names are optional, normalized to one line and bounded to 30 characters", () => {
  assert.equal(normalizeCounterName("  Ana\n  María\t "), "Ana María");
  assert.equal(normalizeCounterName("   "), null);
  assert.equal(normalizeCounterName("a".repeat(30)), "a".repeat(30));
  assert.throws(() => normalizeCounterName("a".repeat(31)));
});
test("wait colors cover exact thresholds, future clocks and invalid dates", () => {
  const ready = "2026-10-24T12:00:00Z", start = Date.parse(ready);
  for (const [offset, tone] of [[-1000, "green"], [120000, "green"], [120001, "yellow"], [300000, "yellow"], [300001, "red"]]) assert.equal(counterWaitTone(ready, start + offset), tone);
  assert.equal(counterWaitTone("invalid", start), "red");
  assert.equal(counterWaitTone(ready, start + 60001, 1, 3), "yellow");
});
test("counter request rejects caller prices, channel overrides and invalid names", () => {
  const request = { request_id: "12345678-1234-4234-8234-123456789abc", payload: { name: " Ana ", items: [{ product_id: "22345678-1234-4234-8234-123456789abc", quantity: 2 }] }, lines: [] };
  assert.equal(counterRequestSchema.parse(request).payload.name, "Ana");
  assert.equal(counterRequestSchema.parse({ ...request, payload: { ...request.payload, name: null } }).payload.name, null);
  for (const patch of [{ total_amount: 1 }, { customer_phone: "+595981123456" }, { is_counter: true }, { name: "a".repeat(31) }]) assert.equal(counterRequestSchema.safeParse({ ...request, payload: { ...request.payload, ...patch } }).success, false);
});
