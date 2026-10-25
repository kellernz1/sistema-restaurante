import { defaultPhoneCountry } from "@/lib/phone-settings";
import { makeOffsiteOrderSchema } from "@/features/customer-ordering/offsite-validation";
import { createCustomerOrder } from "@/lib/order-service";
import { PublicApiError, publicError, publicJson, publicQuota, readPublicBody } from "@/lib/public-table-api";

export async function POST(request: Request) {
  try {
    await publicQuota(request, "offsite-write-ip", 30);
    const parsed = makeOffsiteOrderSchema(await defaultPhoneCountry()).safeParse(await readPublicBody(request));
    if (!parsed.success) throw new PublicApiError(400, "Confira telefone, endereço, pagamento e itens do pedido.");
    await publicQuota(request, "offsite-write-phone", 10, parsed.data.customer_phone);
    try {
      const order = await createCustomerOrder({ ...parsed.data, source: "web" });
      return publicJson({ order_number: order.order_number, tracking_path: `/track/${order.public_token}` }, 201);
    } catch {
      throw new PublicApiError(409, "Não foi possível confirmar o envio. Confira se o restaurante está aberto, os produtos, o valor mínimo e o troco. Antes de reenviar após falha de conexão, consulte o restaurante.");
    }
  } catch (error) { return publicError(error); }
}
