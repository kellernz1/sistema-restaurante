import { publicError, publicJson, publicQuota } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";
import {publicLicense}from "@/lib/licensing";

export async function GET(request: Request) {
  try {
    await publicQuota(request, "menu-read", 1800);
    const db = createAdminClient();
    const [settings, products, categories] = await Promise.all([
      db.from("restaurant_settings").select("default_phone_country, is_accepting_orders, pickup_enabled, delivery_enabled, delivery_fee_mode, delivery_distance_step_km, delivery_distance_step_fee, delivery_fee, min_delivery_order, estimated_pickup_minutes, estimated_delivery_minutes").eq("id", true).single(),
      db.from("products").select("id, category_id, name, price, description, image_version").eq("is_active", true).order("name"),
      db.from("categories").select("id, name").order("sort_order").order("name"),
    ]);
    if (settings.error || products.error || categories.error) throw settings.error ?? products.error ?? categories.error;
    const configuration = await db.rpc("payment_configuration");
    if (configuration.error) throw configuration.error;
    const license=await publicLicense();
    return publicJson({ payment_configuration: configuration.data,settings:{...settings.data,is_accepting_orders:settings.data.is_accepting_orders&&license.orders_enabled,delivery_enabled:settings.data.delivery_enabled&&license.delivery_enabled},products:products.data,categories:categories.data,ordering_notice:license.orders_enabled?null:"Pedidos temporariamente indisponíveis. Fale com o atendimento." });
  } catch (error) { return publicError(error); }
}
