import { operationsStatus } from "../../src/lib/operations.ts";
import { command } from "./operations-process.mjs";
import { loadEnvFile, isProcessRunning } from "./lib.mjs";
import { verifyHistory } from "./migration-history.mjs";
const result=operationsStatus();
const status={docker:false,supabase:false,app:false,processes:{},...result};
try{await command("docker",["info","--format","{{.ServerVersion}}"],{timeout:10000});status.docker=true;}catch{/* Report unavailable. */}
try{await command("docker",["exec","supabase_db_sistema-restaurante","pg_isready","-U","postgres"],{timeout:10000});status.supabase=true;}catch{/* Report unavailable. */}
try{status.app=(await fetch(new URL("/api/health",loadEnvFile().NEXT_PUBLIC_APP_URL),{signal:AbortSignal.timeout(5000)})).ok;}catch{/* Report unavailable. */}
status.processes=Object.fromEntries(Object.entries(result.state.supervisor?.processes??{}).map(([name,pid])=>[name,{pid,running:isProcessRunning(pid)}]));
try{status.history=await verifyHistory();status.alerts.migration=!status.history.ok;}catch{status.history={ok:false,unavailable:true};status.alerts.migration=true;}
console.log(JSON.stringify(status,null,2));
