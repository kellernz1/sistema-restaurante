import { tableTokenSchema } from "@/features/customer-ordering/validation";
import { PublicApiError, publicError, publicJson, publicQuota } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!tableTokenSchema.safeParse(token).success) throw new PublicApiError(404, "Link de acompanhamento inválido.");
    await publicQuota(request, "tracking-read", 1800);
    const db = createAdminClient();
    const order = await db.from("orders").select("id, is_counter, counter_ticket, order_number, order_type, status, total_amount, delivery_fee, cancel_reason, payment_method, cash_change_for")
      .eq("public_token", token).maybeSingle();
    if (order.error) throw order.error;
    if (!order.data) throw new PublicApiError(404, "Pedido não encontrado.");
    if (order.data.is_counter) return publicJson({ is_counter:true, counter_ticket:order.data.counter_ticket, status:order.data.status });
    const [items, settings] = await Promise.all([
      db.from("order_items").select("id, quantity, unit_price, status, products(name)").eq("order_id", order.data.id).order("created_at"),
      db.from("restaurant_settings").select("estimated_pickup_minutes, estimated_delivery_minutes").eq("id", true).single(),
    ]);
    if (items.error || settings.error) throw items.error ?? settings.error;
    const { id, ...safe } = order.data;
    void id;
    return publicJson({ ...safe, items: items.data, estimated_minutes: order.data.order_type === "pickup" ? settings.data.estimated_pickup_minutes : settings.data.estimated_delivery_minutes });
  } catch (error) { return publicError(error); }
}
