import assert from "node:assert/strict";
import test from "node:test";

import { addressSchema, normalizePhone, offsiteOrderSchema, orderActionSchema } from "../src/features/customer-ordering/offsite-validation.ts";
import { settingsSchema } from "../src/features/settings/settings-schema.ts";

const productId = "12345678-1234-4234-8234-123456789abc";
const pickup = { order_type: "pickup", customer_name: " Ana ", phone_country:"BR", customer_phone: "(11) 99999-1234", payment_method: "pix", items: [{ product_id: productId, quantity: 2 }] };
const address = { street: "Rua A", number: "10", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001-000" };
const delivery = { ...pickup, order_type: "delivery", delivery_address: address };

test("normalizes Brazilian phones and preserves explicit international E.164", () => {
  assert.equal(normalizePhone("(11) 99999-1234", "BR"), "+5511999991234");
  assert.equal(normalizePhone("5511999991234", "BR"), "+5511999991234");
  assert.equal(normalizePhone("+1 (212) 555-1234"), "+12125551234");
  assert.equal(offsiteOrderSchema.parse(pickup).customer_name, "Ana");
});

test("requires a complete delivery address and hides delivery fields from pickup payloads", () => {
  assert.equal(offsiteOrderSchema.parse(delivery).delivery_address.zip_code, "01001-000");
  assert.equal(offsiteOrderSchema.safeParse({ ...delivery, delivery_address: undefined }).success, false);
  assert.equal(offsiteOrderSchema.safeParse({ ...pickup, delivery_address: address }).success, false);
  for (const key of ["street"]) {
    assert.equal(addressSchema.safeParse({ ...address, [key]: "" }).success, false, key);
  }
  assert.equal(addressSchema.safeParse({ ...address, state: "Central" }).success, true);
});

test("rejects manipulated totals, fees, source, order types, prices, payment and phone", () => {
  for (const extra of [{ total_amount: 0 }, { delivery_fee: 0 }, { source: "whatsapp" }, { order_type: "dine_in" }, { customer_phone: "invalid" }, { payment_method: "online" }]) {
    assert.equal(offsiteOrderSchema.safeParse({ ...pickup, ...extra }).success, false);
  }
  assert.equal(offsiteOrderSchema.safeParse({ ...pickup, items: [] }).success, false);
  assert.equal(offsiteOrderSchema.safeParse({ ...pickup, items: [{ product_id: productId, quantity: 1, unit_price: 0 }] }).success, false);
});

test("only cash accepts change with integer guaranies", () => {
  assert.equal(offsiteOrderSchema.safeParse({ ...pickup, cash_change_for: 100 }).success, false);
  assert.equal(offsiteOrderSchema.safeParse({ ...pickup, payment_method: "cash", cash_change_for: 100 }).success, true);
  for (const amount of [-1, 1.001, Infinity, "100"]) assert.equal(offsiteOrderSchema.safeParse({ ...pickup, payment_method: "cash", cash_change_for: amount }).success, false);
});

test("rejection and completion require reason and payment respectively", () => {
  assert.equal(orderActionSchema.safeParse({ action: "reject" }).success, false);
  assert.equal(orderActionSchema.safeParse({ action: "reject", reason: " " }).success, false);
  assert.equal(orderActionSchema.safeParse({ action: "reject", reason: "Indisponível" }).success, true);
  assert.equal(orderActionSchema.safeParse({ action: "complete" }).success, false);
  assert.equal(orderActionSchema.safeParse({ action: "complete", payment_method: "pix" }).success, true);
});

test("settings reject negative prices, fractional times, and fractional guaranies", () => {
  const settings = { default_phone_country:"PY", is_accepting_orders: true, dine_in_qr_enabled: true, require_confirmation_for_qr: true, pickup_enabled: true, delivery_enabled: true, whatsapp_enabled: false, kitchen_auto_print_enabled: false, delivery_fee: 5500, min_delivery_order: 20, estimated_pickup_minutes: 30, estimated_delivery_minutes: 50,
    delivery_fee_mode: "fixed", delivery_distance_step_km: 2, delivery_distance_step_fee: 6, delivery_origin_latitude: null, delivery_origin_longitude: null };
  assert.equal(settingsSchema.safeParse(settings).success, true);
  for (const extra of [{ delivery_fee: -1 }, { delivery_fee: 0.001 }, { estimated_pickup_minutes: 0 }, { estimated_delivery_minutes: 2.5 }, { min_delivery_order: NaN }]) assert.equal(settingsSchema.safeParse({ ...settings, ...extra }).success, false);
  assert.equal(settingsSchema.safeParse({ ...settings, delivery_fee_mode: "distance" }).success, false);
  assert.equal(settingsSchema.safeParse({ ...settings, delivery_fee_mode: "distance", delivery_origin_latitude: -23.55, delivery_origin_longitude: -46.63 }).success, true);
});
