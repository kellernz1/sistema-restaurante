import assert from "node:assert/strict";
import test from "node:test";
import { distanceDeliveryFee, mapCoordinates } from "../src/features/customer-ordering/delivery-pricing.ts";

test("delivery charges one full band and rounds each additional band upward", () => {
  for (const [meters, fee] of [[0, 6], [1999, 6], [2000, 6], [2000.1, 12], [4000, 12], [4001, 18], [6000, 18]]) assert.equal(distanceDeliveryFee(meters, 2, 6), fee);
  assert.equal(distanceDeliveryFee(1501, 1.5, 4.25), 8.5);
  assert.equal(distanceDeliveryFee(5000, 2, 0), 0);
  assert.throws(() => distanceDeliveryFee(-1, 2, 6));
  assert.throws(() => distanceDeliveryFee(1000, 0, 6));
});
test("extracts actual map pins and rejects missing or out-of-range coordinates", () => {
  for (const link of ["https://www.google.com/maps/search/?api=1&query=-23.5,-46.6", "https://maps.apple.com/?ll=-23.5,-46.6", "https://waze.com/ul?ll=-23.5,-46.6"]) assert.deepEqual(mapCoordinates(link), { latitude: -23.5, longitude: -46.6 });
  assert.deepEqual(mapCoordinates("https://www.google.com/maps/place/test/@1,2,14z/data=!3d-23.5!4d-46.6"), { latitude: -23.5, longitude: -46.6 });
  assert.equal(mapCoordinates("https://maps.app.goo.gl/example"), null);
  assert.deepEqual(mapCoordinates("https://www.google.com/maps/search/-25.235038,+-57.536561?entry=tts"), { latitude: -25.235038, longitude: -57.536561 });
  assert.equal(mapCoordinates("https://maps.apple.com/?ll=91,0"), null);
});
