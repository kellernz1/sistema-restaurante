import { publicLimit, publicJson, publicError, resolvePublicTable, type PublicTableContext } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request, context: PublicTableContext) {
  try {
    const { token } = await context.params;
    await publicLimit(request, token, false);
    const { table, settings } = await resolvePublicTable(token);
    const db = createAdminClient();
    const [products, categories] = await Promise.all([
      db.from("products").select("id, category_id, name, price, description").eq("is_active", true).order("name"),
      db.from("categories").select("id, name").order("sort_order").order("name"),
    ]);
    if (products.error || categories.error) throw products.error ?? categories.error;
    return publicJson({ table_number: table.table_number, accepting: settings.is_accepting_orders && table.status !== "closing", restaurant_name: "Mesa Certa", products: products.data, categories: categories.data });
  } catch (error) { return publicError(error); }
}
