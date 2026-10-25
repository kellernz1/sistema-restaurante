import { serviceRequestSchema } from "@/features/customer-ordering/validation";
import { PublicApiError, publicLimit, publicJson, publicError, readPublicBody, resolvePublicTable, type PublicTableContext } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request, context: PublicTableContext) {
  try {
    const { token } = await context.params;
    await publicLimit(request, token, true);
    const body = serviceRequestSchema.safeParse(await readPublicBody(request));
    if (!body.success) throw new PublicApiError(400, "Solicitação inválida.");
    await resolvePublicTable(token);
    const { error } = await createAdminClient().rpc("create_table_service_request", { p_token: token, p_type: body.data.type });
    if (error) throw new PublicApiError(409,error.message.includes("One request per minute")?"Aguarde um minuto entre solicitações de atendimento desta mesa.":"Não foi possível solicitar. Fale com o atendimento para conferir esta mesa.");
    return publicJson({ success: true });
  } catch (error) { return publicError(error); }
}
