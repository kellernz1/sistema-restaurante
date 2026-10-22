import { TableGrid } from "@/features/tables/table-grid";
import { createClient } from "@/utils/supabase/server";

export default async function WaiterDashboard() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .select("id, table_number, capacity, status")
    .order("table_number");

  return (
    <TableGrid
      initialTables={data ?? []}
      initialLoadError={error ? "Não foi possível carregar as mesas." : null}
    />
  );
}
