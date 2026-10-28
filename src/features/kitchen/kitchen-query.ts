import type { QueryData, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export function kitchenQuery(supabase: SupabaseClient<Database>, from = 0, to = 249) {
  return supabase
    .from("order_items")
    .select(`
      id, quantity, status, notes, created_at,
      products(name),
      orders!inner(id, order_number, order_type, customer_name, is_counter, counter_ticket, counter_name, status, tables(table_number))
    `)
    .in("orders.status", ["open", "ready"])
    .in("status", ["pending", "preparing", "ready"])
    .order("created_at")
    .order("id")
    .range(from, to);
}

export type KitchenItem = QueryData<ReturnType<typeof kitchenQuery>>[number];
export type KitchenStatus = "pending" | "preparing" | "ready";
export async function loadKitchenItems(supabase: SupabaseClient<Database>) {
  const data: KitchenItem[] = [];
  let after: KitchenItem | undefined;
  for (;;) {
    const result = await supabase.rpc("kitchen_queue_page", {
      p_after_created: after?.created_at,
      p_after_id: after?.id,
      p_limit: 250,
    });
    if (result.error) return { data: null, error: result.error };
    const page = result.data as unknown as KitchenItem[];
    data.push(...page);
    if (page.length < 250) return { data, error: null };
    after = page[page.length-1];
  }
}
