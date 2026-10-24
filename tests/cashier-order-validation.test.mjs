import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("@/") ? new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href : specifier, context);
} });
const { cashierOrderSchema } = await import("../src/features/cashier/order-validation.ts");

const requestId = "12345678-1234-4234-8234-123456789abc";
const productId = "22345678-1234-4234-8234-123456789abc";
const tableId = "32345678-1234-4234-8234-123456789abc";
const items = [{ product_id: productId, quantity: 2, notes: "Sem cebola" }];
const pickup = { order_type: "pickup", customer_name: " Ana ", customer_phone: "(11) 99999-1234", payment_method: "pix", items };
const address = { street: "Rua A", number: "10", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001-000" };

test("accepts table, pickup and delivery without trusting client prices", () => {
  assert.equal(cashierOrderSchema.parse({ request_id: requestId, payload: { order_type: "dine_in", table_id: tableId, items } }).payload.order_type, "dine_in");
  const result = cashierOrderSchema.parse({ request_id: requestId, payload: pickup });
  assert.equal(result.payload.customer_phone, "+5511999991234");
  assert.equal(result.payload.customer_name, "Ana");
  const delivery = cashierOrderSchema.parse({ request_id: requestId, payload: { ...pickup, order_type: "delivery", delivery_address: address } });
  assert.equal(delivery.payload.delivery_address.zip_code, "01001000");
});

test("rejects actor/source/status/price overrides and missing request IDs", () => {
  for (const addition of [{ actor_id: tableId }, { source: "web" }, { status: "closed" }, { total_amount: 0 }, { delivery_fee: 0 }]) {
    assert.equal(cashierOrderSchema.safeParse({ request_id: requestId, payload: { ...pickup, ...addition } }).success, false);
  }
  assert.equal(cashierOrderSchema.safeParse({ payload: pickup }).success, false);
  assert.equal(cashierOrderSchema.safeParse({ request_id: requestId, actor_id: tableId, payload: pickup }).success, false);
  assert.equal(cashierOrderSchema.safeParse({ request_id: requestId, payload: { ...pickup, items: [{ ...items[0], unit_price: 0 }] } }).success, false);
});

test("requires a table, customer details for offsite orders and complete delivery data", () => {
  for (const payload of [
    { order_type: "dine_in", items },
    { ...pickup, customer_phone: "123" },
    { ...pickup, customer_name: "" },
    { ...pickup, order_type: "delivery" },
    { ...pickup, order_type: "delivery", delivery_address: { street: "Rua A" } },
    { ...pickup, cash_change_for: 50 },
    { ...pickup, items: [] },
    { ...pickup, items: [{ ...items[0], quantity: 0 }] },
  ]) assert.equal(cashierOrderSchema.safeParse({ request_id: requestId, payload }).success, false);
});
