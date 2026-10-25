import fs from "node:fs";
import {createClient} from "@supabase/supabase-js";
import {findDbContainer,isProcessRunning,loadEnvFile,run} from "./lib.mjs";

if(!process.argv.includes("--confirm-local-db-restart"))throw new Error("Pass --confirm-local-db-restart after stopping tests and ensuring the print queue is idle");
const env=loadEnvFile();if(env.APP_MODE!=="local")throw new Error("Local mode required");
const state=JSON.parse(fs.readFileSync(".local-secrets/processes.json","utf8"));
if(!isProcessRunning(state.printWorker))throw new Error("Start the print worker first");
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const active=await db.from("print_jobs").select("id",{head:true,count:"exact"}).is("archived_at",null).in("status",["pending","processing","uncertain"]).abortSignal(AbortSignal.timeout(3000));
if(active.error||active.count!==0)throw new Error("An idle print queue is required; no restart performed");
async function heartbeat(){const result=await db.from("print_worker_heartbeats").select("instance_id,last_seen_at,version").eq("driver","file").order("last_seen_at",{ascending:false}).limit(1).maybeSingle().abortSignal(AbortSignal.timeout(1500));return result.error?null:result.data;}
let before;
for(let attempt=0;attempt<20;attempt++){before=await heartbeat();if(before)break;await new Promise(resolve=>setTimeout(resolve,1000));}
if(!before)throw new Error("No initial heartbeat; no restart performed");
const container=findDbContainer();
if(container!=="supabase_db_sistema-restaurante")throw new Error("Unexpected database container; refusing restart");
const began=Date.now();
run("docker",["restart",container],{capture:true});
for(let attempt=0;attempt<45;attempt++){
 const after=await heartbeat();
 if(after&&after.instance_id===before.instance_id&&Date.parse(after.last_seen_at)>began){
  if(!isProcessRunning(state.printWorker))throw new Error("Worker process changed during restart");
  const evidence={testedAt:new Date().toISOString(),workerPid:state.printWorker,instance:after.instance_id,version:after.version,recoverySeconds:Math.ceil((Date.now()-began)/1000),scope:"PostgreSQL container restart only; no reset or active print dispatch"};
  fs.writeFileSync(".local-secrets/print-reconnect-4a1.json",JSON.stringify(evidence,null,2));
  console.log(`PASS: same print worker recovered its heartbeat after PostgreSQL restart in ${evidence.recoverySeconds}s. No database reset or print dispatch.`);
  process.exit(0);
 }
 await new Promise(resolve=>setTimeout(resolve,1000));
}
throw new Error("Heartbeat did not recover within the acceptance window; inspect local services");
