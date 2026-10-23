import type { QueryData, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export function cashierTablesQuery(db: SupabaseClient<Database>) {
  return db.from("tables").select("id, table_number, capacity, status")
    .in("status", ["occupied", "closing"]).order("table_number");
}

export type CashierTable = QueryData<ReturnType<typeof cashierTablesQuery>>[number];

export function billItemsQuery(db: SupabaseClient<Database>, orderId: string) {
  return db.from("order_items").select("id, quantity, unit_price, notes, status, products(name)")
    .eq("order_id", orderId).order("created_at").order("id");
}

export type BillItem = QueryData<ReturnType<typeof billItemsQuery>>[number];
