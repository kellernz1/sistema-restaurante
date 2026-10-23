import { z } from "zod";

import { notifyCustomer } from "@/features/orders/notifications";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

const schema = z.strictObject({ expected: z.enum(["pending", "preparing"]), status: z.enum(["preparing", "ready"]) })
  .refine((value) => value.expected === "pending" ? value.status === "preparing" : value.status === "ready");

export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const { db } = await requireStaff(["admin", "kitchen"]);
    const id = z.uuid().safeParse((await params).itemId);
    const body = schema.safeParse(await readPublicBody(request));
    if (!id.success || !body.success) throw new PublicApiError(400, "Transição inválida.");
    const before = await db.from("order_items").select("order_id, orders!inner(status)").eq("id", id.data).single();
    if (before.error || before.data.orders.status !== "open") throw new PublicApiError(409, "Pedido indisponível.");
    const updated = await db.from("order_items").update({ status: body.data.status }).eq("id", id.data).eq("status", body.data.expected).select("id");
    if (updated.error || !updated.data.length) throw new PublicApiError(409, "Item alterado por outra pessoa.");
    const order = await db.from("orders").select("*").eq("id", before.data.order_id).single();
    if (order.data?.status === "ready") {
      try { await notifyCustomer(order.data, "ready"); } catch { console.error("Customer notification failed after item update"); }
    }
    return publicJson({ success: true });
  } catch (error) { return publicError(error); }
}
