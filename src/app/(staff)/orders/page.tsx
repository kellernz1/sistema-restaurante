import { hubQuery } from "@/features/orders/hub-query";
import { OrdersHub } from "@/features/orders/orders-hub";
import { createClient } from "@/utils/supabase/server";

export default async function OrdersPage() {
  const { data, error } = await hubQuery(await createClient());
  return <OrdersHub initialOrders={data ?? []} initialError={!!error} />;
}
