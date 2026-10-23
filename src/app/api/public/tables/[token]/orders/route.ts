import { tableOrderSchema } from "@/features/customer-ordering/validation";
import { createCustomerOrder } from "@/lib/order-service";
import { PublicApiError, publicLimit, publicJson, publicError, readPublicBody, resolvePublicTable, type PublicTableContext } from "@/lib/public-table-api";

export async function POST(request: Request, context: PublicTableContext) {
  try {
    const { token } = await context.params;
    await publicLimit(request, token, true);
    const body = tableOrderSchema.safeParse(await readPublicBody(request));
    if (!body.success) throw new PublicApiError(400, "Confira os produtos, quantidades e observações do pedido.");
    const { table, settings } = await resolvePublicTable(token);
    if (!settings.is_accepting_orders || table.status === "closing") throw new PublicApiError(409, "Esta mesa não está recebendo pedidos. Chame o garçom.");
    try {
      const order = await createCustomerOrder({ ...body.data, order_type: "dine_in", table_id: table.id, table_token: token });
      return publicJson({ order_id: order.id, order_number: order.order_number, status: order.status }, 201);
    } catch {
      throw new PublicApiError(409, "Não foi possível confirmar o envio. Confira com o garçom e atualize o cardápio antes de tentar novamente.");
    }
  } catch (error) { return publicError(error); }
}
