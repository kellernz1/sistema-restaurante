import { z } from "zod";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";

const command = z.discriminatedUnion("action", [
 z.strictObject({ action:z.literal("review"),job_id:z.uuid(),decision:z.enum(["printed","reprint","discard"]),request_id:z.uuid() }),
 z.strictObject({ action:z.literal("heartbeat"),owner_id:z.uuid(),version:z.string().min(1).max(80) }),
 z.strictObject({ action: z.literal("claim"), owner_id: z.uuid() }),
 z.strictObject({ action: z.literal("finish"), owner_id: z.uuid(), job_id: z.uuid(), token: z.uuid(), status: z.enum(["sent","failed","uncertain"]), error: z.string().max(300).optional() }),
 z.strictObject({ action: z.literal("request"), request_id: z.uuid(), kind: z.enum(["kitchen","receipt","test"]).optional(), order_id: z.uuid().optional(), job_id: z.uuid().optional(), destination: z.enum(["kitchen","cashier"]).default("kitchen") }),
]);
const configuration = z.discriminatedUnion("type", [
 z.strictObject({type:z.literal("policy"),stall_seconds:z.number().int().min(10).max(3600)}),
 z.strictObject({ type: z.literal("device"), id: z.uuid(), name: z.string().trim().min(1).max(80), driver: z.enum(["browser","file"]), paper_mm: z.union([z.literal(58),z.literal(80)]), columns: z.number().int().min(24).max(64), codepage: z.enum(["cp860","cp850"]), codepage_number: z.number().int().min(0).max(255), locale: z.enum(["pt-BR","es"]) }),
 z.strictObject({ type: z.literal("destination"), name: z.enum(["kitchen","cashier"]), device_id: z.uuid(), receipt_timing: z.enum(["on_demand","on_payment"]) }),
]);
export async function GET(request:Request) {
 try {
  const { db,role } = await requireStaff(["admin","kitchen","cashier"]);
  const params=new URL(request.url).searchParams;
  const status=z.enum(["all","pending","processing","sent","failed","uncertain"]).parse(params.get("status")??"all");
  const archived=params.get("archived")==="true";
  const fields="id,order_id,destination,kind,additional,reprint,snapshot,device,status,sent_at,error_message,created_at,reviewed_at,reviewed_by,review_decision,archived_at" as const;
  let query=db.from("print_jobs").select(fields).order("created_at",{ascending:false}).limit(30);
  query=archived?query.not("archived_at","is",null):query.is("archived_at",null);
  if(status!=="all")query=query.eq("status",status);
  const states=["pending","processing","sent","failed","uncertain"];
  const [jobs,devices,destinations,issues,problems,health,counts] = await Promise.all([
   query,
   db.from("print_devices").select("*"),db.from("print_destinations").select("*"),
   db.rpc("print_issue_count"),
   status==="all"&&!archived?db.from("print_jobs").select(fields).in("status",["failed","uncertain"]).is("reviewed_at",null).is("archived_at",null).order("created_at").limit(30):Promise.resolve({data:[],error:null}),
   db.rpc("print_worker_health"),
   Promise.all(states.map(async state=>{let count=db.from("print_jobs").select("id",{head:true,count:"exact"}).eq("status",state);count=archived?count.not("archived_at","is",null):count.is("archived_at",null);const result=await count;if(result.error)throw result.error;return [state,result.count??0] as const;})),
  ]);
  if(jobs.error || devices.error || destinations.error || issues.error || problems.error || health.error) throw new Error("Print query failed");
  return publicJson({jobs:[...new Map([...problems.data,...jobs.data].map(j=>[j.id,j])).values()],devices:devices.data,destinations:destinations.data,issues:issues.data??0,health:health.data,counts:Object.fromEntries(counts),role});
 } catch(error) { return publicError(error instanceof z.ZodError?new PublicApiError(400,"Confira os filtros de impressão."):error); }
}
export async function POST(request: Request) {
 try {
  const { db,role } = await requireStaff(["admin","kitchen","cashier","waiter"]);
  const v = command.parse(await readPublicBody(request));
  if(role==="waiter" && v.action!=="request") throw new PublicApiError(403,"Acesso indisponível.");
  const result = v.action === "claim" ? await db.rpc("claim_print_job",{p_owner_id:v.owner_id,p_driver:"browser"})
   : v.action === "finish" ? await db.rpc("finish_print_job",{p_job_id:v.job_id,p_owner_id:v.owner_id,p_token:v.token,p_status:v.status,p_error:v.error})
   : v.action === "review" ? await db.rpc("decide_print_job",{p_job_id:v.job_id,p_decision:v.decision,p_request_id:v.request_id})
   : v.action === "heartbeat" ? await db.rpc("print_worker_heartbeat",{p_instance:v.owner_id,p_version:v.version,p_driver:"browser"})
   : await db.rpc("request_print",{p_request_id:v.request_id,p_kind:v.kind,p_order_id:v.order_id,p_job_id:v.job_id,p_destination:v.destination});
  if(result.error) throw new PublicApiError(result.error.code==="42501"?403:409,"Não foi possível processar a impressão. Confira a fila.");
  return publicJson(result.data);
 } catch(error) { return publicError(error instanceof z.ZodError ? new PublicApiError(400,"Confira os dados de impressão.") : error); }
}
export async function PATCH(request: Request) {
 try {
  const { db } = await requireStaff(["admin"]);
  const v=configuration.parse(await readPublicBody(request));
  if(v.type==="policy"){
   const result=await db.from("print_settings").update({stall_seconds:v.stall_seconds}).eq("id",true);
   if(result.error)throw result.error;return publicJson({success:true});
  }
  if(v.type==="device" && v.driver==="file" && process.env.APP_MODE!=="local" && process.env.NODE_ENV!=="development") throw new PublicApiError(400,"Arquivo de teste disponível somente no ambiente local.");
  const existing=v.type==="device"?await db.from("print_devices").select("id").eq("id",v.id).maybeSingle():null;
  if(existing?.error)throw existing.error;
  const fields=v.type==="device"?{name:v.name,driver:v.driver,paper_mm:v.paper_mm,columns:v.columns,codepage:v.codepage,codepage_number:v.codepage_number,locale:v.locale}:null;
  const result=v.type==="device" ? existing?.data
   ? await db.from("print_devices").update(fields!).eq("id",v.id).select("id")
   : await db.from("print_devices").insert({id:v.id,...fields!}).select("id")
   : await db.from("print_destinations").update({device_id:v.device_id,receipt_timing:v.receipt_timing}).eq("name",v.name).select("name");
  if(result.error || !result.data?.length) throw new Error("Print settings update failed");
  return publicJson({success:true});
 } catch(error) { return publicError(error instanceof z.ZodError ? new PublicApiError(400,"Confira os dados de impressão.") : error); }
}
