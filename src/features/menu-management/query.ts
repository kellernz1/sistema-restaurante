import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database.types";

export async function managementProducts(db: SupabaseClient<Database>) {
  const products: Tables<"products">[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("products").select("*").order("name").order("id").range(offset, offset + 999);
    if (error) throw error;
    products.push(...data);
    if (data.length < 1000) return products;
  }
}
