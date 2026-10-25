import {z} from "zod";
import {createAdminClient} from "@/utils/supabase/admin";
import {publicJson,publicError,PublicApiError,readPublicBody,publicLimit,type PublicTableContext} from "@/lib/public-table-api";
const schema=z.strictObject({id:z.uuid(),access_token:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(500)});
export async function POST(request:Request,context:PublicTableContext){try{const {token}=await context.params;await publicLimit(request,token,true);const v=schema.safeParse(await readPublicBody(request));if(!v.success)throw new PublicApiError(400,"Informe o motivo do cancelamento.");const result=await createAdminClient().rpc("cancel_qr_request",{p_token:token,p_id:v.data.id,p_access:v.data.access_token,p_reason:v.data.reason});if(result.error)throw new PublicApiError(409,"Só é possível cancelar antes da confirmação.");return publicJson({success:true});}catch(e){return publicError(e);}}
