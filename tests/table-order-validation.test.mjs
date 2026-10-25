import assert from "node:assert/strict";
import test from "node:test";

import { serviceRequestSchema, tableOrderSchema, tableTokenSchema } from "../src/features/customer-ordering/validation.ts";

const productId = "12345678-1234-4234-8234-123456789abc";
const valid = { request_id:productId,source: "nfc", customer_name: " Ana ", items: [{ product_id: productId, quantity: 2, notes: " sem cebola " }] };

test("accepts QR/NFC orders and normalizes optional customer data and notes", () => {
  const parsed = tableOrderSchema.parse(valid);
  assert.equal(parsed.customer_name, "Ana");
  assert.equal(parsed.items[0].notes, "sem cebola");
  assert.equal(tableOrderSchema.parse({request_id:valid.request_id,customer_name:"Ana",items: valid.items }).source, "qr");
  assert.equal(parsed.source, "nfc");
});

test("rejects tampered prices, totals, order types, and channels", () => {
  for (const extra of [{ total_amount: 0 }, { order_type: "delivery" }, { table_id: productId }, { source: "web" }]) {
    assert.equal(tableOrderSchema.safeParse({ ...valid, ...extra }).success, false);
  }
  for (const extra of [{ unit_price: 0 }, { price: 0 }, { status: "ready" }]) {
    assert.equal(tableOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], ...extra }] }).success, false);
  }
});

test("rejects empty carts, invalid UUIDs, invalid quantities and excessive payload fields", () => {
  assert.equal(tableOrderSchema.safeParse({ items: [] }).success, false);
  assert.equal(tableOrderSchema.safeParse({ items: Array(51).fill(valid.items[0]) }).success, false);
  for (const quantity of [0, -1, 1.5, 100, "2", null]) {
    assert.equal(tableOrderSchema.safeParse({ items: [{ product_id: productId, quantity }] }).success, false);
  }
  assert.equal(tableOrderSchema.safeParse({ items: [{ product_id: "bad", quantity: 1 }] }).success, false);
  assert.equal(tableOrderSchema.safeParse({ ...valid, customer_name: "x".repeat(81) }).success, false);
  assert.equal(tableOrderSchema.safeParse({ items: [{ ...valid.items[0], notes: "x".repeat(501) }] }).success, false);
});

test("only accepts high-entropy token format and supported service requests", () => {
  assert.equal(tableTokenSchema.safeParse("a".repeat(64)).success, true);
  for (const token of ["", "1", "a".repeat(63), "g".repeat(64), "../orders"]) assert.equal(tableTokenSchema.safeParse(token).success, false);
  assert.equal(serviceRequestSchema.safeParse({ type: "waiter" }).success, true);
  assert.equal(serviceRequestSchema.safeParse({ type: "bill" }).success, true);
  assert.equal(serviceRequestSchema.safeParse({ type: "bill", table_id: productId }).success, false);
  assert.equal(serviceRequestSchema.safeParse({ type: "other" }).success, false);
});
