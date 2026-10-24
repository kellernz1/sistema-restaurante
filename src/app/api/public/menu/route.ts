import { publicError, publicJson, publicQuota } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request) {
  try {
    await publicQuota(request, "menu-read", 1800);
    const db = createAdminClient();
    const [settings, products, categories] = await Promise.all([
      db.from("restaurant_settings").select("is_accepting_orders, pickup_enabled, delivery_enabled, delivery_fee_mode, delivery_distance_step_km, delivery_distance_step_fee, delivery_fee, min_delivery_order, estimated_pickup_minutes, estimated_delivery_minutes").eq("id", true).single(),
      db.from("products").select("id, category_id, name, price, description, image_version").eq("is_active", true).order("name"),
      db.from("categories").select("id, name").order("sort_order").order("name"),
    ]);
    if (settings.error || products.error || categories.error) throw settings.error ?? products.error ?? categories.error;
    return publicJson({ settings: settings.data, products: products.data, categories: categories.data });
  } catch (error) { return publicError(error); }
}
