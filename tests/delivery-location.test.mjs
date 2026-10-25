import assert from "node:assert/strict";
import test from "node:test";
import { coordinatesMapLink, mapLinkSchema } from "../src/features/customer-ordering/delivery-location.ts";
import { addressSchema, deliveryAddressSchema, offsiteOrderSchema } from "../src/features/customer-ordering/offsite-validation.ts";

test("delivery accepts trusted map links and rejects unsafe or misleading URLs", () => {
  for (const url of ["https://maps.app.goo.gl/example", "https://www.google.com/maps?q=-23,-46", "https://maps.apple.com/?ll=-23,-46", "https://waze.com/ul?ll=-23,-46", "https://goo.gl/maps/example"]) assert.equal(mapLinkSchema.safeParse(url).success, true, url);
  for (const url of ["javascript:alert(1)", "http://maps.app.goo.gl/example", "https://maps.app.goo.gl.evil.test/", "https://google.com@evil.test/maps", "https://www.google.com/url?q=evil", "https://user@maps.apple.com/", "https://waze.com:8443/", "https://example.com/", "x".repeat(2049)]) assert.equal(mapLinkSchema.safeParse(url).success, false, url);
});

test("GPS coordinates become a fixed map pin with valid geographic bounds", () => {
  const url = coordinatesMapLink(-23.55052, -46.633308);
  assert.equal(mapLinkSchema.safeParse(url).success, true);
  assert.ok(url.includes("-23.550520,-46.633308"));
  for (const pair of [[91, 0], [0, -181], [NaN, 0], [0, Infinity]]) assert.throws(() => coordinatesMapLink(...pair));
});

test("checkout preserves optional location and still validates the delivery address", () => {
  const address = { street: "Rua A", number: "10", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001-000", location_url: coordinatesMapLink(-23.55, -46.63) };
  const payload = { order_type: "delivery", customer_name: "Ana", phone_country:"BR", customer_phone: "11999999999", payment_method: "pix", delivery_address: address, items: [{ product_id: "12345678-1234-4234-8234-123456789abc", quantity: 1, notes: "" }] };
  assert.equal(offsiteOrderSchema.parse(payload).delivery_address.location_url, address.location_url);
  assert.equal(addressSchema.safeParse({ ...address, location_url: "https://evil.test" }).success, false);
  assert.equal(addressSchema.safeParse({ ...address, street: "" }).success, false);
  const { location_url, ...legacy } = address;
  assert.equal(addressSchema.safeParse(legacy).success, true);
  assert.ok(location_url);
});

test("a map location replaces the required written address, but delivery cannot have neither", () => {
  const location_url = coordinatesMapLink(-23.55, -46.63);
  assert.equal(deliveryAddressSchema.parse({ location_url }).street, null);
  assert.equal(deliveryAddressSchema.safeParse({ location_url, number: "", zip_code: "", state: "" }).success, true);
  assert.equal(deliveryAddressSchema.safeParse({ location_url, reference: "Portão azul" }).success, true);
  assert.equal(deliveryAddressSchema.safeParse({}).success, false);
  assert.equal(deliveryAddressSchema.safeParse({ street: "", location_url: "https://evil.test" }).success, false);
  assert.equal(deliveryAddressSchema.safeParse({ location_url, zip_code: "123" }).success, true);
});
