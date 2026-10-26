import { counterRequestSchema } from "@/features/counter/validation";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
export async function POST(request: Request) {
  try {
    const { db } = await requireStaff(["admin", "cashier"]);
    const input = counterRequestSchema.safeParse(await readPublicBody(request));
    if (!input.success) throw new PublicApiError(400, "Confira o nome, os itens e os pagamentos.");
    const { data, error } = await db.rpc("create_counter_order", { p_request_id: input.data.request_id, p_payload: input.data.payload, p_lines: input.data.lines });
    if (error?.message.includes("Open cash session required")) throw new PublicApiError(409,"Abra o caixa antes de registrar pagamentos.");
    if (error) {
      if(!/^[0-9A-Z]{5}$/.test(error.code??""))throw error;
      throw new PublicApiError(409,input.data.payload.discount?"Pedido não criado. Confira os pagamentos e autorize novamente o desconto do carrinho.":"Pedido não criado. Confira preços, pagamento, cotação e configuração do balcão.");
    }
    return publicJson(data, 201);
  } catch (error) { return publicError(error); }
}
