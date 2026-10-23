import type { QueryData, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export function kitchenQuery(supabase: SupabaseClient<Database>) {
  return supabase
    .from("order_items")
    .select(`
      id, quantity, status, notes, created_at,
      products(name),
      orders!inner(id, order_number, order_type, customer_name, status, tables(table_number))
    `)
    .eq("orders.status", "open")
    .in("status", ["pending", "preparing", "ready"])
    .order("created_at")
    .order("id");
}

export type KitchenItem = QueryData<ReturnType<typeof kitchenQuery>>[number];
export type KitchenStatus = "pending" | "preparing" | "ready";
