import type { QueryData, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export function hubQuery(db: SupabaseClient<Database>) {
  return db.from("orders").select("*, tables(table_number), order_items(id, quantity, unit_price, notes, status, products(name))")
    .order("status").order("created_at", { ascending: false }).limit(200);
}
export type HubOrder = QueryData<ReturnType<typeof hubQuery>>[number];
