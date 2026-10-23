import assert from "node:assert/strict";
import test from "node:test";

import { billSubtotal, lineSubtotalInCents } from "../src/features/cashier/bill-totals.ts";

test("uses historical item price even when the catalog price changed", () => {
  const item = { unit_price: 19.9, quantity: 3, products: { price: 25 } };
  assert.equal(billSubtotal([item]), 59.7);
});

test("adds fractional real amounts as integer cents", () => {
  assert.equal(billSubtotal([
    { unit_price: 0.1, quantity: 3 },
    { unit_price: 0.2, quantity: 1 },
    { unit_price: 12.35, quantity: 7 },
  ]), 86.95);
  assert.equal(lineSubtotalInCents({ unit_price: 19.9, quantity: 3 }), 5970);
});

test("handles empty bills and free items", () => {
  assert.equal(billSubtotal([]), 0);
  assert.equal(billSubtotal([{ unit_price: 0, quantity: 4 }]), 0);
});
