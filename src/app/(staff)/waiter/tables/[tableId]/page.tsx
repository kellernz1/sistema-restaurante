import { getTranslation } from "@/lib/i18n/server";
﻿import Link from "next/link";
import { TableOrder } from "@/features/orders/table-order";
import { createClient } from "@/utils/supabase/server";

export default async function WaiterTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const t = await getTranslation();
  const { tableId } = await params;
  const db = await createClient();
  const [table, order, products, categories] = await Promise.all([
    db.from("tables").select("*").eq("id", tableId).maybeSingle(),
    db.from("orders").select("*").eq("table_id", tableId).eq("order_type", "dine_in").not("status", "in", '("closed","cancelled")').maybeSingle(),
    db.from("products").select("*").eq("is_active", true).order("name"),
    db.from("categories").select("*").order("sort_order").order("name"),
  ]);
  if (!table.data || table.error || order.error || products.error || categories.error) {
    return <section className="table-detail-state"><h1>{t("Não foi possível carregar a comanda")}</h1><p>{t("Confira a conexão e tente novamente.")}</p><Link href="/waiter">{t("Voltar ao mapa")}</Link></section>;
  }
  return <TableOrder initialTable={table.data} initialOrder={order.data} products={products.data ?? []} categories={categories.data ?? []} />;
}
