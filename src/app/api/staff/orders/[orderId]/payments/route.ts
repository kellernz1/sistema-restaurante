import { z } from "zod";
import { requireStaff } from "@/lib/staff-api";
import { publicError, publicJson, readPublicBody, PublicApiError } from "@/lib/public-table-api";
import { paymentRequestSchema } from "@/features/payments/validation";
import { notifyCustomer } from "@/features/orders/notifications";
import type { StoredRow } from "@/types/records";

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { db } = await requireStaff(["admin", "cashier"]);
    const id = z.uuid().safeParse((await params).orderId);
    if (!id.success) throw new PublicApiError(400, "Pagamento inválido.");
    const { data, error } = await db.from("payments").select("id,method,currency,original_amount,equivalent_pyg,change_pyg,exchange_rate::text,created_at,rounding,rounding_adjustment_pyg").eq("order_id", id.data).order("created_at");
    if (error) throw error;
    return publicJson(data);
  } catch (error) { return publicError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { db } = await requireStaff(["admin", "cashier"]);
    const id = z.uuid().safeParse((await params).orderId);
    const input = paymentRequestSchema.safeParse(await readPublicBody(request));
    if (!id.success || !input.success) throw new PublicApiError(400, "Pagamento inválido.");
    const { data, error } = await db.rpc("record_order_payments", { p_order_id: id.data, p_request_id: input.data.request_id, p_lines: input.data.lines });
    if (error) throw new PublicApiError(409, "Confira o saldo, as formas habilitadas e a cotação atual antes de tentar novamente.");
    const result = data as { order: StoredRow<"orders"> } | null;
    if (result?.order?.status === "closed") await notifyCustomer(result.order, "completed");
    return publicJson(data);
  } catch (error) { return publicError(error); }
}
