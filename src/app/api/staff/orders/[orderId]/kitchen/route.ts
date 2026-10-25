import { z } from "zod";
import { notifyCustomer } from "@/features/orders/notifications";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

const schema = z.strictObject({ request_id: z.uuid(), action: z.enum(["start", "ready"]) });

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { db } = await requireStaff(["admin", "kitchen"]);
    const id = z.uuid().safeParse((await params).orderId);
    const body = schema.safeParse(await readPublicBody(request));
    if (!id.success || !body.success) throw new PublicApiError(400, "Transição inválida.");
    const result = await db.rpc("advance_kitchen_order", { p_order_id: id.data, p_request_id: body.data.request_id, p_action: body.data.action });
    if (result.error) throw new PublicApiError(result.error.code === "42501" ? 403 : 409, "Pedido indisponível.");
    if (body.data.action === "ready") {
      const order = await db.from("orders").select("*").eq("id", id.data).single();
      if (order.data?.status === "ready") await notifyCustomer(order.data, "ready");
    }
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
