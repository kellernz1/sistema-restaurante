import { KitchenBoard } from "@/features/kitchen/kitchen-board";
import { kitchenQuery } from "@/features/kitchen/kitchen-query";
import { createClient } from "@/utils/supabase/server";

export default async function KitchenDashboard() {
  const supabase = await createClient();
  const { data, error } = await kitchenQuery(supabase);
  return <KitchenBoard initialItems={data ?? []} initialError={!!error} />;
}
