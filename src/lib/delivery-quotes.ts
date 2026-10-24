import "server-only";

import { mapLinkSchema } from "@/features/customer-ordering/delivery-location";
import { distanceDeliveryFee, mapCoordinates } from "@/features/customer-ordering/delivery-pricing";
import { PublicApiError } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function resolveMapCoordinates(location: string) {
  if (!mapLinkSchema.safeParse(location).success) throw new PublicApiError(400, "Envie um link de mapa válido.");
  let current = location;
  const signal = AbortSignal.timeout(10000);
  for (let hop = 0; hop < 5; hop += 1) {
    const point = mapCoordinates(current);
    if (point) return point;
    const url = new URL(current);
    // Only these exact short-link services may be contacted; never fetch arbitrary user URLs.
    if (!["maps.app.goo.gl", "goo.gl"].includes(url.hostname)) break;
    const response = await fetch(current, { method: "HEAD", redirect: "manual", signal, cache: "no-store" });
    const redirect = response.headers.get("location");
    await response.body?.cancel();
    if (![301, 302, 303, 307, 308].includes(response.status) || !redirect) break;
    const next = mapLinkSchema.safeParse(new URL(redirect, current).href);
    if (!next.success) break;
    current = next.data;
  }
  throw new PublicApiError(400, "Não foi possível identificar o ponto desse link. Use o GPS ou copie um link com o ponto exato no mapa.");
}

export async function createDeliveryQuote(location: string) {
  const db = createAdminClient();
  const settingsResult = await db.from("restaurant_settings").select("*").eq("id", true).single();
  if (settingsResult.error) throw settingsResult.error;
  const settings = settingsResult.data;
  if (!settings.is_accepting_orders || !settings.delivery_enabled) throw new PublicApiError(409, "Entrega indisponível no momento.");
  if (settings.delivery_fee_mode === "fixed") return { id: null, fee: settings.delivery_fee, distance_meters: null, expires_at: null };
  if (settings.delivery_origin_latitude === null || settings.delivery_origin_longitude === null) throw new PublicApiError(409, "O restaurante precisa configurar o ponto de saída das entregas.");
  const pricing = { mode: settings.delivery_fee_mode, step_km: settings.delivery_distance_step_km, step_fee: settings.delivery_distance_step_fee, latitude: settings.delivery_origin_latitude, longitude: settings.delivery_origin_longitude };
  const cached = await db.from("delivery_quotes").select("id,fee,distance_meters,expires_at").eq("location_url", location).eq("pricing", JSON.stringify(pricing)).gt("expires_at", new Date(Date.now() + 60000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (cached.error) throw cached.error;
  if (cached.data) return cached.data;

  const quota = await db.rpc("consume_public_rate_limit", { p_key: "routing-global", p_limit: 1, p_window_seconds: 1 });
  if (quota.error) throw quota.error;
  if (!quota.data) throw new PublicApiError(429, "Aguarde um instante e tente calcular a entrega novamente.");
  const target = await resolveMapCoordinates(location);
  // The public demo is used only in local testing. Production must configure its own routing service.
  const base = process.env.DELIVERY_ROUTING_URL || (process.env.APP_MODE === "local" ? "https://router.project-osrm.org" : "");
  if (!base) throw new PublicApiError(503, "O serviço de rotas ainda não foi configurado pelo restaurante.");
  const coordinates = `${settings.delivery_origin_longitude},${settings.delivery_origin_latitude};${target.longitude},${target.latitude}`;
  const response = await fetch(`${base.replace(/\/$/, "")}/route/v1/driving/${coordinates}?overview=false&steps=false&alternatives=false&generate_hints=false`, { signal: AbortSignal.timeout(12000), redirect: "error", cache: "no-store", headers: { "User-Agent": "MesaCerta-Delivery/1.0" } });
  if (!response.ok) throw new PublicApiError(503, "Não foi possível consultar a rota. Tente novamente.");
  const body = await response.json();
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !Number.isFinite(route?.distance) || route.distance < 0 || route.distance > 1000000 || !body.waypoints?.every((point: { distance: number }) => Number.isFinite(point.distance) && point.distance <= 250)) throw new PublicApiError(422, "Não encontramos uma rota de entrega próxima desse ponto. Confira a localização no mapa.");
  const distance = Math.ceil(route.distance);
  const fee = distanceDeliveryFee(distance, settings.delivery_distance_step_km, settings.delivery_distance_step_fee);
  if (fee > 999999.99) throw new PublicApiError(422, "Essa rota ultrapassa o limite de entrega. Fale com o restaurante.");
  await db.from("delivery_quotes").delete().lt("expires_at", new Date().toISOString());
  const saved = await db.from("delivery_quotes").insert({ location_url: location, distance_meters: distance, fee, pricing }).select("id,fee,distance_meters,expires_at").single();
  if (saved.error) throw saved.error;
  return saved.data;
}
