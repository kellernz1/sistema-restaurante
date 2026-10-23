import { z } from "zod";

import { PublicApiError, publicLimit, publicJson, publicError, resolvePublicTable, type PublicTableContext } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request, context: PublicTableContext) {
  try {
    const { token } = await context.params;
    await publicLimit(request, token, false);
    const orderId = z.uuid().safeParse(new URL(request.url).searchParams.get("order"));
    if (!orderId.success) throw new PublicApiError(400, "Comanda inválida.");
    const { table } = await resolvePublicTable(token);
    const db = createAdminClient();
    const { data: order, error } = await db.from("orders").select("id, order_number, status")
      .eq("id", orderId.data).eq("table_id", table.id).eq("order_type", "dine_in").maybeSingle();
    if (error) throw error;
    if (!order) throw new PublicApiError(404, "Comanda não encontrada para esta mesa.");
    const items = await db.from("order_items").select("id, quantity, status, products(name)").eq("order_id", order.id).order("created_at");
    if (items.error) throw items.error;
    return publicJson({ ...order, items: items.data });
  } catch (error) { return publicError(error); }
}
