import { defaultPhoneCountry } from "@/lib/phone-settings";
import { makeCashierOrderSchema } from "@/features/cashier/order-validation";
import { createCashierOrder } from "@/lib/order-service";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";

export async function POST(request: Request) {
  try {
    const { userId } = await requireStaff(["admin", "cashier"]);
    const input = makeCashierOrderSchema(await defaultPhoneCountry()).safeParse(await readPublicBody(request));
    if (!input.success) throw new PublicApiError(400, "Confira mesa, itens, dados do cliente e pagamento.");
    try {
      const order = await createCashierOrder(userId, input.data.request_id, input.data.payload);
      return publicJson({ order_id: order.id, order_number: order.order_number, total_amount: order.total_amount }, 201);
    } catch (failure) {
      if(failure instanceof PublicApiError)throw failure;
      const code = typeof failure === "object" && failure !== null && "code" in failure ? String(failure.code) : "";
      if (/^(22|23|42|P0)/.test(code)) {
        throw new PublicApiError(409, "Não foi possível lançar o pedido. Confira a mesa, disponibilidade dos produtos, mínimo de entrega e troco.");
      }
      throw new PublicApiError(503, "Não foi possível confirmar o resultado. Consulte o mesmo envio para evitar duplicar os itens.");
    }
  } catch (error) { return publicError(error); }
}
