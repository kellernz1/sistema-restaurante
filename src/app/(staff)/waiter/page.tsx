import { getTranslation } from "@/lib/i18n/server";
import { TableGrid } from "@/features/tables/table-grid";
import { ServiceAlerts } from "@/features/tables/service-alerts";
import { createClient } from "@/utils/supabase/server";

export default async function WaiterDashboard() {
  const t = await getTranslation();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .select("id, table_number, capacity, status")
    .order("table_number");

  return (
    <div className="table-dashboard"><ServiceAlerts /><TableGrid
      initialTables={data ?? []}
      initialLoadError={error ? t("Não foi possível carregar as mesas.") : null}
    /></div>
  );
}
