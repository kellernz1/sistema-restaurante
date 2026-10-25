import {requireStaff} from "@/lib/staff-api";
import {publicJson,publicError,PublicApiError,readPublicBody} from "@/lib/public-table-api";
import {cashCommandSchema,cashPolicySchema} from "@/features/cash-sessions/validation";
export async function GET(){
 try{const {db,userId,role}=await requireStaff(["admin","cashier"]);
 const fields="id,operator_id,status,business_date,opened_at,closed_at,opening_amount,difference,revision" as const;
 const [sessions,policy,current]=await Promise.all([db.from("cash_sessions").select(fields).order("opened_at",{ascending:false}).limit(100),db.from("cash_session_policy").select("require_open_session,blind_count").eq("id",true).single(),db.from("cash_sessions").select(fields).eq("operator_id",userId).eq("status","open").maybeSingle()]);
 if(sessions.error||policy.error||current.error)throw new Error("Session query failed");
 const active=current.data;
 const rows=active&&!sessions.data.some(s=>s.id===active.id)?[active,...sessions.data]:sessions.data;
 return publicJson({sessions:rows,current:active,policy:policy.data,user_id:userId,role});
 }catch(error){return publicError(error);}
}
export async function POST(request:Request){
 try{const {db}=await requireStaff(["admin","cashier"]);const parsed=cashCommandSchema.safeParse(await readPublicBody(request));if(!parsed.success)throw new PublicApiError(400,"Confira os dados do caixa.");
 const v=parsed.data;const result=await db.rpc("cash_session_command",{p_request_id:v.request_id,p_action:v.action,p_payload:v.payload});
 if(result.error)throw new PublicApiError(result.error.code==="42501"?403:409,"Não foi possível concluir. Confira a sessão e atualize a tela.");return publicJson(result.data);
 }catch(error){return publicError(error);}
}
export async function PATCH(request:Request){
 try{const {db}=await requireStaff(["admin"]);const v=cashPolicySchema.safeParse(await readPublicBody(request));if(!v.success)throw new PublicApiError(400,"Confira as opções de caixa.");const result=await db.from("cash_session_policy").update(v.data).eq("id",true);if(result.error)throw result.error;return publicJson({success:true});}catch(error){return publicError(error);}
}
