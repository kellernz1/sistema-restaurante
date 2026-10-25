import {createAdminClient} from "@/utils/supabase/admin";
import {z} from "zod";
import {requireStaff} from "@/lib/staff-api";
import {publicJson,publicError,PublicApiError} from "@/lib/public-table-api";
export async function GET(_:Request,{params}:{params:Promise<{sessionId:string}>}){
 try{const {db}=await requireStaff(["admin","cashier"]);const id=z.uuid().safeParse((await params).sessionId);if(!id.success)throw new PublicApiError(400,"Sessão inválida.");const result=await db.rpc("cash_session_report",{p_session:id.data});if(result.error)throw new PublicApiError(result.error.code==="42501"?403:404,"Relatório indisponível.");const events=await db.from("cash_session_events").select("id,action,actor_id,created_at,payload").eq("session_id",id.data).order("created_at");if(events.error)throw events.error;const actorIds=[...new Set(events.data.map(event=>event.actor_id))];
 const names=new Map<string,string|null>();
 // Resolve only actors from the already authorized session history.
 if(actorIds.length){const profiles=await createAdminClient().from("profiles").select("id,full_name").in("id",actorIds);if(profiles.error)throw profiles.error;for(const profile of profiles.data)names.set(profile.id,profile.full_name);}
 return publicJson({...result.data as object,events:events.data.map(event=>({...event,actor_name:names.get(event.actor_id)??null}))});}catch(error){return publicError(error);}
}
