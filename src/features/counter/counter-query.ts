import type { QueryData, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { collectQueryPages } from "@/lib/query-pages";

function counterQuery(db: SupabaseClient<Database>, from: number, to: number) {
  return db.from("orders")
    .select("id,status,counter_ticket,counter_name,counter_ready_at,counter_business_date,created_at,payment_status,total_amount")
    .eq("is_counter", true).in("status", ["open", "ready"])
    .order("counter_ready_at", { nullsFirst: false }).order("created_at").order("id")
    .range(from, to);
}
export type CounterQueueOrder = QueryData<ReturnType<typeof counterQuery>>[number];
export function loadCounterQueue(db: SupabaseClient<Database>) {
  return collectQueryPages<CounterQueueOrder>((from, to) => counterQuery(db, from, to));
}
