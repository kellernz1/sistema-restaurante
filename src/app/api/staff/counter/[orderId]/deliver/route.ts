import { z } from "zod";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson } from "@/lib/public-table-api";
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { db } = await requireStaff(["admin", "cashier"]);
    const id = z.uuid().safeParse((await params).orderId);
    if (!id.success) throw new PublicApiError(400, "Pedido inválido.");
    const { data, error } = await db.rpc("deliver_counter_order", { p_order_id: id.data });
    if (error) throw new PublicApiError(409, "A senha precisa estar pronta e paga antes da entrega.");
    return publicJson({ order: data });
  } catch (error) { return publicError(error); }
}
