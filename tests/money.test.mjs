import assert from "node:assert/strict";
import test from "node:test";
import { money, brl, brlCentsFor, MAX_MONEY } from "../src/lib/money.ts";
import { paymentRequestSchema, exchangeRateSchema } from "../src/features/payments/validation.ts";

test("PYG formatting is shared across languages and never uses cents", () => {
  assert.equal(money.format(25000), "Gs. 25.000");
  assert.equal(money.format(0), "Gs. 0");
  assert.equal(money.format(MAX_MONEY), "Gs. 1.000.000.000.000");
  assert.match(brl.format(1250), /12,50/);
});
test("exact decimal exchange uses the least covering cent or configured upward step", () => {
  assert.equal(brlCentsFor(25000, "1400.00000000", "none"), 1786);
  assert.equal(brlCentsFor(25000, "1400", "half_real"), 1800);
  assert.equal(brlCentsFor(25000, "1400", "whole_real"), 1800);
  assert.equal(brlCentsFor(25201, "1400", "half_real"), 1850);
  assert.equal(brlCentsFor(25201, "1400", "whole_real"), 1900);
  assert.equal(brlCentsFor(1, "0.01000001", "none"), 10000);
  assert.throws(() => brlCentsFor(1.1, "1400", "none"));
  assert.throws(() => brlCentsFor(1, "0", "none"));
});
test("payment payloads reject unsafe amounts, extra totals and fractional minor units", () => {
  const request = { request_id: "12345678-1234-4234-8234-123456789abc", lines: [{ method: "transfer", currency: "PYG", original_amount: 25000, amount_pyg: 25000 }] };
  assert.equal(paymentRequestSchema.safeParse(request).success, true);
  assert.equal(paymentRequestSchema.safeParse({ ...request, lines: [{ ...request.lines[0], method: "cash", currency: "BRL" }] }).success, false);
  assert.equal(paymentRequestSchema.safeParse({ ...request, lines: [{ ...request.lines[0], method: "cash", currency: "PYG" }] }).success, true);
  for (const value of [-1, 0.5, Infinity, MAX_MONEY + 1]) assert.equal(paymentRequestSchema.safeParse({ ...request, lines: [{ ...request.lines[0], original_amount: value }] }).success, false);
  assert.equal(paymentRequestSchema.safeParse({ ...request, total: 0 }).success, false);
  assert.equal(exchangeRateSchema.safeParse({ rate: "1400.12345678", rounding: "none" }).success, true);
  assert.equal(exchangeRateSchema.safeParse({ rate: "1400.123456789", rounding: "none" }).success, false);
});
