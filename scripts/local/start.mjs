import fs from "node:fs";
import path from "node:path";
import { ensureDirectory, isProcessRunning, loadEnvFile, LOCAL_STATE_DIR, ROOT, LOG_DIR, runSupabase, startDetached } from "./lib.mjs";
import { command, waitFor, rotateLog } from "./operations-process.mjs";

ensureDirectory(LOCAL_STATE_DIR);
const stateFile=path.join(LOCAL_STATE_DIR,"processes.json");
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,"utf8")):{};
if(isProcessRunning(state.supervisor)){console.log("Local supervisor already running. Use local:status.");process.exit(0);}
if([state.app,state.worker,state.printWorker].some(isProcessRunning))throw new Error("Legacy processes are running. Stop the app/workers before starting supervision.");
if(!fs.existsSync(path.join(ROOT,".env.local")))throw new Error("Environment missing. Run local:setup first.");
if(!fs.existsSync(path.join(ROOT,".next","BUILD_ID")))throw new Error("Production build missing. Run local:update before daily start.");
console.log("Waiting for Docker Desktop (up to 180 seconds)...");
await waitFor(()=>command("docker",["info","--format","{{.ServerVersion}}"],{timeout:10000}),"Docker Desktop");
runSupabase(["start"],{timeout:300000,capture:true});
await waitFor(()=>command("docker",["exec","supabase_db_sistema-restaurante","pg_isready","-U","postgres"],{timeout:10000}),"Supabase database",120000);
const env=loadEnvFile();
for(const file of ["supervisor.log","supervisor.error.log"])rotateLog(path.join(LOG_DIR,file));
const supervisor=startDetached(["scripts/local/supervisor.mjs"],"supervisor",env);
await waitFor(async()=>{
  if(!isProcessRunning(supervisor))throw new Error("Supervisor exited");
  const response=await fetch(new URL("/api/health",env.NEXT_PUBLIC_APP_URL),{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error("App/database not healthy");
  const current=JSON.parse(fs.readFileSync(stateFile,"utf8"));
  if(![current.app,current.worker,current.printWorker].every(isProcessRunning))throw new Error("A supervised process is not ready");
},"app and database",90000);
console.log(`Local services supervised (PID ${supervisor}). Open ${env.NEXT_PUBLIC_APP_URL}. No build was performed.`);
