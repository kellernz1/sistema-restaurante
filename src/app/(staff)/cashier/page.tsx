import { CashierBoard } from "@/features/cashier/cashier-board";
import { cashierTablesQuery } from "@/features/cashier/cashier-query";
import { createClient } from "@/utils/supabase/server";

export default async function CashierDashboard() {
  const db = await createClient();
  const { data, error } = await cashierTablesQuery(db);
  return <CashierBoard initialTables={data ?? []} initialError={!!error} />;
}
