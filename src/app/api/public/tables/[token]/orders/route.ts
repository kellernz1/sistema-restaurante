import { tableOrderSchema } from "@/features/customer-ordering/validation";
import {licensingError}from "@/lib/licensing";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizePhone } from "@/lib/phone";
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
      const db=createAdminClient();
      const configuration=await db.from("restaurant_settings").select("default_phone_country").single();
      const policy=await db.from("service_policy").select("qr_phone").single();
      if(configuration.error||policy.error)throw configuration.error||policy.error;
      const {request_id,phone_country,customer_phone,...fields}=body.data;
      const prior=await db.from("qr_requests").select("payload").eq("request_id",request_id).maybeSingle();if(prior.error)throw prior.error;
      // Retries preserve the original normalized contract if phone policy changed meanwhile.
      const collectPhone=prior.data?typeof (prior.data.payload as Record<string,unknown>).customer_phone==="string":policy.data.qr_phone!=="off";
      const phone=collectPhone&&customer_phone?.trim()?normalizePhone(customer_phone,phone_country??(configuration.data.default_phone_country==="BR"?"BR":"PY")):undefined;
      const result=await db.rpc("submit_qr_order",{p_token:token,p_request_id:request_id,p_payload:{...fields,...(phone?{customer_phone:phone}:{})}});
      if(result.error)throw result.error;
      return publicJson(result.data,201);
    } catch(error) {
      if(licensingError(error))throw licensingError(error);
      const failure=error as {message?:string;code?:string};
      const messages:Record<string,string>={
        "Pending table limit reached":"Esta mesa já atingiu o limite de pedidos aguardando confirmação. Aguarde o atendimento.",
        "Pending phone limit reached":"Este telefone já atingiu o limite de pedidos aguardando confirmação. Aguarde o atendimento.",
        "Phone blocked":"Este telefone está bloqueado para pedidos. Fale com o atendimento.",
        "Customer phone required":"Informe seu telefone para enviar o pedido.",
        "Invalid phone":"Confira o telefone e o país selecionado."
      };
      const known=!!messages[failure.message??""]||["22023","23514","P0001","P0002","42501","22P02"].includes(failure.code??"");
      throw new PublicApiError(known?409:503,messages[failure.message??""]??(known?"Pedido não enviado. Confira nome e telefone, limite de pedidos pendentes e disponibilidade da mesa com o atendimento.":"Envio incerto. Use Consultar envio para verificar o mesmo pedido."));
    }
  } catch (error) { return publicError(error); }
}
