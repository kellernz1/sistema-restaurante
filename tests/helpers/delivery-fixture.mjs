import assert from "node:assert/strict";

// Trusted test setup replaces the external routing service, not order validation.
export async function deliveryFixture(db, testContext, settings) {
  const address = { street: "Rua Teste", number: "10", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001000",
    location_url: "https://www.google.com/maps/search/?api=1&query=-23.550520,-46.633308" };
  if (settings.delivery_fee_mode === "fixed") return { address, fee: Number(settings.delivery_fee) };
  const distance = 2500;
  const fee = Math.max(1, Math.ceil(distance / (Number(settings.delivery_distance_step_km) * 1000))) * Number(settings.delivery_distance_step_fee);
  const quote = await db.from("delivery_quotes").insert({ location_url: address.location_url, distance_meters: distance, fee,
    pricing: { mode: settings.delivery_fee_mode, step_km: settings.delivery_distance_step_km, step_fee: settings.delivery_distance_step_fee,
      latitude: settings.delivery_origin_latitude, longitude: settings.delivery_origin_longitude } }).select("id").single();
  assert.ifError(quote.error);
  testContext.after(async () => assert.ifError((await db.from("delivery_quotes").delete().eq("id", quote.data.id)).error));
  return { address: { ...address, delivery_quote_id: quote.data.id }, fee };
}
