import "server-only";

import type { Json } from "@/types/database.types";
import { createAdminClient } from "@/utils/supabase/admin";

// All public channels share the database's transactional validation and pricing.
export async function createCustomerOrder(payload: Json) {
  const { data, error } = await createAdminClient().rpc("create_customer_order", { p_payload: payload });
  if (error || !data) throw error ?? new Error("No order returned");
  return data;
}
