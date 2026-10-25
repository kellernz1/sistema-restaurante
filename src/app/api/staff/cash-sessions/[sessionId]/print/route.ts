import {z} from "zod";
import {requireStaff} from "@/lib/staff-api";
import {publicJson,publicError,PublicApiError,readPublicBody} from "@/lib/public-table-api";
export async function POST(request:Request,{params}:{params:Promise<{sessionId:string}>}){
 try{const {db}=await requireStaff(["admin","cashier"]);const id=z.uuid().safeParse((await params).sessionId);const body=z.strictObject({request_id:z.uuid()}).safeParse(await readPublicBody(request));if(!id.success||!body.success)throw new PublicApiError(400,"Confira os dados de impressão.");const result=await db.rpc("request_cash_session_print",{p_session:id.data,p_request_id:body.data.request_id});if(result.error)throw new PublicApiError(result.error.code==="42501"?403:409,"Relatório indisponível.");return publicJson({job_id:result.data});}catch(error){return publicError(error);}
}
