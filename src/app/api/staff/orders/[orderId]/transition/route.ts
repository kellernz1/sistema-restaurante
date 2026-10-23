import { z } from "zod";

import { orderActionSchema } from "@/features/customer-ordering/offsite-validation";
import { notifyCustomer, type CustomerEvent } from "@/features/orders/notifications";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { db } = await requireStaff(["admin", "cashier"]);
    const id = z.uuid().safeParse((await params).orderId);
    const input = orderActionSchema.safeParse(await readPublicBody(request));
    if (!id.success || !input.success) throw new PublicApiError(400, "Confira a ação, o motivo e o pagamento.");
    const { data, error } = await db.rpc("advance_hub_order", { p_order_id: id.data, p_action: input.data.action, p_reason: input.data.reason, p_payment_method: input.data.payment_method });
    if (error || !data) throw new PublicApiError(409, "O pedido foi alterado ou esta ação não está disponível. Atualize a central.");
    const events: Record<string, CustomerEvent> = { accept: "accepted", reject: "rejected", ready: "ready", dispatch: "out_for_delivery", complete: "completed" };
    try {
      await notifyCustomer(data, events[input.data.action]);
      if (input.data.action === "accept" && data.status === "ready") await notifyCustomer(data, "ready");
    } catch { console.error("Customer notification failed after order transition"); }
    return publicJson({ success: true });
  } catch (error) { return publicError(error); }
}
