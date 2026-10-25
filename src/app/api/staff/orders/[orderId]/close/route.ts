import { z } from "zod";

import { notifyCustomer } from "@/features/orders/notifications";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { db } = await requireStaff(["cashier", "admin"]);
    const id = z.uuid().safeParse((await params).orderId);
    const input = z.strictObject({ payment_method: z.enum(["cash", "transfer", "card", "pix"]) }).safeParse(await readPublicBody(request));
    if (!id.success || !input.success) throw new PublicApiError(400, "Pagamento inválido.");
    const existing = await db.from("orders").select("id").eq("id", id.data).eq("order_type", "dine_in").maybeSingle();
    if (existing.error || !existing.data) throw new PublicApiError(404, "Comanda não encontrada.");
    const result = await db.rpc("close_order", { p_order_id: id.data, p_payment_method: input.data.payment_method });
    if (result.error?.message.includes("Open cash session required")) throw new PublicApiError(409,"Abra o caixa antes de registrar pagamentos.");
    if (result.error || !result.data) throw new PublicApiError(409, "A comanda foi alterada ou já encerrada. Atualize a conta.");
    await notifyCustomer(result.data, "completed");
    return publicJson({ order: result.data });
  } catch (error) { return publicError(error); }
}
