import assert from "node:assert/strict";
import test from "node:test";

import { billSubtotal, lineSubtotal } from "../src/features/cashier/bill-totals.ts";

test("uses historical item price even when the catalog price changed", () => {
  const item = { unit_price: 19900, quantity: 3, products: { price: 25 } };
  assert.equal(billSubtotal([item]), 59700);
});

test("adds integer guaranies without cent scaling", () => {
  assert.equal(billSubtotal([
    { unit_price: 100, quantity: 3 },
    { unit_price: 200, quantity: 1 },
    { unit_price: 12350, quantity: 7 },
  ]), 86950);
  assert.equal(lineSubtotal({ unit_price: 19900, quantity: 3 }), 59700);
});

test("handles empty bills and free items", () => {
  assert.equal(billSubtotal([]), 0);
  assert.equal(billSubtotal([{ unit_price: 0, quantity: 4 }]), 0);
});
