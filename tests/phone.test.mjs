import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone, phoneAliases, addressStorageKeys, whatsappIdentity } from "../src/lib/phone.ts";
import { makeOffsiteOrderSchema, makePhoneSchema, deliveryAddressSchema } from "../src/features/customer-ordering/offsite-validation.ts";

const cases = [
  ["0981 123 456", "PY", "+595981123456"], ["+595 981 123456", "PY", "+595981123456"],
  ["595981123456", "PY", "+595981123456"], ["981123456", "PY", "+595981123456"],
  ["(11) 91234-5678", "BR", "+5511912345678"], ["+55 11 91234-5678", "PY", "+5511912345678"],
  ["11912345678", "BR", "+5511912345678"], ["+55 11 1234-5678", "BR", "+5511912345678"],
];
for (const [input, country, expected] of cases) test(`${country}: ${input} normalizes to ${expected}`, () => assert.equal(normalizePhone(input, country), expected));
test("explicit local country wins and invalid inputs are never extracted from text", () => {
  for (const value of ["123", "abc981123456", "0981 x123456", "++595981123456", ""]) assert.equal(makePhoneSchema("PY").safeParse(value).success, false);
  assert.throws(() => normalizePhone("11912345678", "PY"));
  assert.throws(() => normalizePhone("981123456", "BR"));
});
test("safe ninth-digit aliases share identity and local address storage; landlines stay separate", () => {
  assert.deepEqual(phoneAliases("+5511912345678"), ["+5511912345678", "+551112345678"]);
  assert.deepEqual(addressStorageKeys("+551112345678"), addressStorageKeys("11912345678", "BR"));
  assert.deepEqual(addressStorageKeys("0981 123 456", "PY"), addressStorageKeys("+595981123456"));
  const storage = new Map([[addressStorageKeys("11912345678", "BR")[0], { street: "Av. España 123", reference: "Portón azul" }]]);
  assert.deepEqual(storage.get(addressStorageKeys("+551112345678")[0]), { street: "Av. España 123", reference: "Portón azul" });
  assert.equal(storage.get(addressStorageKeys("+595981123456")[0]), undefined);
  assert.equal(normalizePhone("+551123456789"), "+551123456789");
  assert.equal(phoneAliases("+5511923456789").length, 1);
});
test("WhatsApp transport recipient remains original while canonical identity is shared", () => {
  assert.deepEqual(whatsappIdentity("551112345678"), { phone: "+5511912345678", recipient: "551112345678" });
  assert.equal(whatsappIdentity("5511912345678").phone, whatsappIdentity("551112345678").phone);
});
test("server order validation uses restaurant default or explicit country; addresses require no UF/CEP", () => {
  const order = { order_type: "delivery", customer_name: "Ana", customer_phone: "0981 123 456", payment_method: "cash", items: [{ product_id: "12345678-1234-4234-8234-123456789abc", quantity: 1 }], delivery_address: { street: "Mariscal López 123", city: "Asunción", reference: "Portón azul" } };
  const parsed = makeOffsiteOrderSchema("PY").parse(order);
  assert.equal(parsed.customer_phone, "+595981123456");
  assert.equal(parsed.delivery_address.state, null);
  assert.equal(parsed.delivery_address.zip_code, null);
  assert.equal(makeOffsiteOrderSchema("PY").parse({ ...order, customer_phone: "11912345678", phone_country: "BR" }).customer_phone, "+5511912345678");
  assert.equal(makeOffsiteOrderSchema("BR").parse({ ...order, customer_phone: "11912345678" }).customer_phone, "+5511912345678");
  assert.equal(makeOffsiteOrderSchema("PY").safeParse({ ...order, customer_phone: "11912345678" }).success, false);
  assert.equal(deliveryAddressSchema.parse({ location_url: "https://maps.apple.com/?ll=-25.3,-57.6" }).street, null);
});
