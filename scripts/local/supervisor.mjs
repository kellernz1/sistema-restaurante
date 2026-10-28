import {guardEntry,resolveTarget,requireAutomation} from "../target-safety.mjs";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "../target-process.mjs";
import { ROOT, LOCAL_STATE_DIR, loadEnvFile, isProcessRunning , findDbContainer } from "./lib.mjs";
import {operationsDirectory,readOperationsPolicy,readOperationsState} from "../../src/lib/operations.ts";
import {atomicJson,patchOperationsState} from "../target-state.mjs";
import {command,logLine} from "../target-operations.mjs";
import { RestartBudget, backupReason } from "./restart-budget.mjs";
await guardEntry(import.meta.url,"runtime");


const env = loadEnvFile(), stateFile = path.join(LOCAL_STATE_DIR,"processes.json");
const lockFile = path.join(operationsDirectory,"supervisor.lock");
fs.mkdirSync(operationsDirectory,{recursive:true});
if(fs.existsSync(lockFile)) {
  if(isProcessRunning(Number(fs.readFileSync(lockFile,"utf8")))) throw new Error("Supervisor already running");
  fs.unlinkSync(lockFile);
}
fs.writeFileSync(lockFile,String(process.pid),{flag:"wx"});
const budget=new RestartBudget();
const children = new Map(), attempts = budget.attempts, failures = new Set();
const definitions = {
  app: ["scripts/next-command.mjs","start","-H","0.0.0.0"],
  worker: ["scripts/whatsapp-worker.mjs"],
  printWorker: ["scripts/print-worker.mjs"],
  licenseWorker: ["scripts/license-worker.mjs"],
};
let stopping = false, backup = null, lastBackupAttempt = 0, lastProbe = 0;
const startedAt=new Date().toISOString();
function persist() {
  const processes = Object.fromEntries([...children].map(([key,child])=>[key,child.pid]));
  atomicJson(resolveTarget(),stateFile,{...processes,supervisor:process.pid,startedAt});
  atomicJson(resolveTarget(),path.join(operationsDirectory,"supervisor.json"),{heartbeat:new Date().toISOString(),failures:[...failures],processes,restarts:attempts});
}
function start(name) {
  if(stopping || children.has(name)) return;
  const delay=budget.take(name);
  if(delay===null) { failures.add(name); persist(); return; }
  const child=spawn(process.execPath,definitions[name],{cwd:ROOT,env:{...process.env,...env,NEXT_TELEMETRY_DISABLED:"1"},windowsHide:true,stdio:["ignore","pipe","pipe"]});
  children.set(name,child); persist();
  child.stdout.on("data",bytes=>logLine(resolveTarget(),name,bytes.toString("utf8").slice(0,65536)));
  child.stderr.on("data",bytes=>logLine(resolveTarget(),`${name}.error`,bytes.toString("utf8").slice(0,65536)));
  child.on("error",()=>failures.add(name));
  child.on("close",()=>{
    children.delete(name); logLine(resolveTarget(),"supervisor",`${name} exited; attempt ${attempts[name]}/5`); persist();
    if(!stopping)setTimeout(()=>start(name),delay);
  });
}
for(const name of Object.keys(definitions))start(name);
function runBackup(reason) {
  if(backup || stopping)return;
  lastBackupAttempt=Date.now();
  const target=resolveTarget();requireAutomation(target,"backup");
  backup=spawn(process.execPath,["scripts/local/backup.mjs"],{cwd:ROOT,env:{...process.env,...env,BACKUP_REASON:reason},windowsHide:true,stdio:["ignore","pipe","pipe"]});
  backup.stdout.on("data",bytes=>logLine(resolveTarget(),"backup",bytes.toString("utf8").slice(0,65536)));
  backup.stderr.on("data",bytes=>logLine(resolveTarget(),"backup.error",bytes.toString("utf8").slice(0,65536)));
  const deadline=setTimeout(()=>{if(backup)backup.kill("SIGKILL");},900000);
  backup.on("error",()=>{failures.add("backup");});
  backup.on("close",code=>{clearTimeout(deadline);if(code!==0){failures.add("backup");patchOperationsState(resolveTarget(),{result:"failed"});}else failures.delete("backup");backup=null;persist();});
}
let ticking=false;
const timer=setInterval(async()=>{
  if(ticking||stopping)return;ticking=true;
  try {
    persist();
    const policy=readOperationsPolicy(), state=readOperationsState();
    if(state.result==="valid")failures.delete("backup");
    const due=backupReason(state,policy,lastBackupAttempt,null);
    if(due)runBackup(due);
    if(Date.now()-lastProbe>30000){
      lastProbe=Date.now();
      const response=await fetch(new URL("/api/health",env.NEXT_PUBLIC_APP_URL),{signal:AbortSignal.timeout(8000)});
      if(response.ok)failures.delete("app-health");else failures.add("app-health");
      if(policy.after_cash_close){
        const latest=(await command(resolveTarget(),"docker",["exec",findDbContainer(),"psql","-X","-U","postgres","-d","postgres","-Atc","select max(created_at) from public.cash_session_events where action='close'"],{timeout:10000})).trim();
        const closeDue=backupReason(state,policy,lastBackupAttempt,latest);
        if(closeDue)runBackup(closeDue);
      }
    }
    failures.delete("operations-probe");
  } catch { failures.add("operations-probe"); }
  finally { ticking=false;persist(); }
},5000);
async function shutdown() {
  if(stopping)return;stopping=true;clearInterval(timer);
  for(const child of children.values())child.kill();
  if(backup)backup.kill();
  fs.rmSync(lockFile,{force:true});process.exit(0);
}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
process.on("exit",()=>{try{fs.rmSync(lockFile,{force:true});}catch{/* Process may already be terminated. */}});
