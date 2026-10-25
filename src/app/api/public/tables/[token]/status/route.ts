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
    const access=new URL(request.url).searchParams.get("access");
    const staged=await db.from("qr_requests").select("id,status,reason,items,order_id,actor_kind").eq("id",orderId.data).eq("table_id",table.id).eq("access_token",access??"").maybeSingle();
    if(staged.error)throw staged.error;
    if(staged.data){
      const request=staged.data;
      const items=(request.items as {name:string;quantity:number}[]).map((item,index)=>({id:String(index),quantity:item.quantity,status:request.status==="confirmed"?"pending":request.status,products:{name:item.name}}));
      return publicJson({id:request.id,order_number:"",status:request.status,reason:request.reason,actor_kind:request.actor_kind,items});
    }
    const { data: order, error } = await db.from("orders").select("id, order_number, status")
      .eq("id", orderId.data).eq("table_id", table.id).eq("order_type", "dine_in").maybeSingle();
    if (error) throw error;
    if (!order) throw new PublicApiError(404, "Comanda não encontrada para esta mesa.");
    const items = await db.from("order_items").select("id, quantity, status, products(name)").eq("order_id", order.id).order("created_at");
    if (items.error) throw items.error;
    return publicJson({ ...order, items: items.data });
  } catch (error) { return publicError(error); }
}
