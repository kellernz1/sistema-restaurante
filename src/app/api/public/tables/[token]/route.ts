import { publicLimit, publicJson, publicError, resolvePublicTable, type PublicTableContext } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";
import {publicLicense}from "@/lib/licensing";

export async function GET(request: Request, context: PublicTableContext) {
  try {
    const { token } = await context.params;
    await publicLimit(request, token, false);
    const { table, settings } = await resolvePublicTable(token);
    const db = createAdminClient();
    const [products, categories] = await Promise.all([
      db.from("products").select("id, category_id, name, price, description, image_version").eq("is_active", true).order("name"),
      db.from("categories").select("id, name").order("sort_order").order("name"),
    ]);
    if (products.error || categories.error) throw products.error ?? categories.error;
    const policy=await db.from("service_policy").select("qr_phone").single();
    const restaurant=await db.from("restaurant_settings").select("restaurant_name,default_phone_country").single();
    if(policy.error||restaurant.error)throw policy.error||restaurant.error;
    const license=await publicLicense();
    return publicJson({table_number:table.table_number,accepting:settings.is_accepting_orders&&table.status!=="closing"&&license.orders_enabled,ordering_notice:license.orders_enabled?null:"Pedidos temporariamente indisponíveis. Fale com o atendimento.",restaurant_name:restaurant.data.restaurant_name,phone_mode:policy.data.qr_phone,default_phone_country:restaurant.data.default_phone_country,products:products.data,categories:categories.data});
  } catch (error) { return publicError(error); }
}
