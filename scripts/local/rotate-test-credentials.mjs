import fs from "node:fs";
import path from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {isIP} from "node:net";
import {createClient} from "@supabase/supabase-js";
import {createBackup,validateBackup} from "./backup.mjs";
import {isMain,ROOT,LOCAL_STATE_DIR,loadEnvFile,isProcessRunning,run,runSupabase} from "./lib.mjs";
import {DEMO_EMAILS} from "../demo-data.mjs";

export function replaceAssignments(source,changes){
 let result=source;
 for(const [name,value]of Object.entries(changes)){
  if(!/^[A-Z_]+$/.test(name)||!value||/[\r\n]/.test(value))throw Error("Invalid maintenance assignment");
  const pattern=new RegExp("^"+name+"=.*$","gm"),matches=result.match(pattern)??[];
  if(matches.length!==1)throw Error("Missing or duplicate maintenance variable");
  result=result.replace(pattern,()=>name+"="+value);
 }
 return result;
}
export function assertLocalTarget(value){
 const url=new URL(value),host=url.hostname;
 const bytes=host.split(".").map(Number);
 const privateIp=isIP(host)===4&&(bytes[0]===127||bytes[0]===10||(bytes[0]===172&&bytes[1]>=16&&bytes[1]<=31)||(bytes[0]===192&&bytes[1]===168));
 if(url.protocol!=="http:"||url.port!=="54321"||url.username||url.password||url.search||url.hash||url.pathname!=="/"||!(privateIp||host==="localhost"||host==="[::1]"))throw Error("Local provider target required");
}
function atomic(file,content){const tmp=file+".rotation.tmp";try{fs.writeFileSync(tmp,content,{flag:"wx",mode:0o600});fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}}
function client(env,key){return createClient(env.NEXT_PUBLIC_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});}
function required(result){if(result.error)throw Error("Auth maintenance request failed");return result.data;}

export async function rotateAuthUsers({admin,users,password,makePublicClient,oldPassword}){
 let revoked=0,oldPasswordsRejected=0,oldRefreshRejected=0;
 for(const user of users){
  let previous;
  if(oldPassword){const before=await makePublicClient().auth.signInWithPassword({email:user.email,password:oldPassword});previous=before.data?.session;}
  let signed;
  if(!oldPassword){const probe=await makePublicClient().auth.signInWithPassword({email:user.email,password});if(!probe.error)signed=probe.data;}
  if(!signed?.session){
   required(await admin.auth.admin.updateUserById(user.id,{password}));
   signed=required(await makePublicClient().auth.signInWithPassword({email:user.email,password}));
  }
  if(!signed.session)throw Error("New login did not establish a session");
  required(await admin.auth.admin.signOut(signed.session.access_token,"global"));revoked++;
  const refresh=await makePublicClient().auth.refreshSession({refresh_token:signed.session.refresh_token});
  if(!refresh.error)throw Error("Revoked refresh session still accepted");
  if(previous){const old=await makePublicClient().auth.refreshSession({refresh_token:previous.refresh_token});if(!old.error)throw Error("Previous refresh session still accepted");oldRefreshRejected++;}
  if(oldPassword){const old=await makePublicClient().auth.signInWithPassword({email:user.email,password:oldPassword});if(!old.error)throw Error("Previous password still accepted");oldPasswordsRejected++;}
 }
 return {accounts_updated:users.length,sessions_globally_revoked:revoked,old_passwords_rejected:oldPasswordsRejected,old_refresh_tokens_rejected:oldRefreshRejected};
}

export async function rotateTestCredentials(){
 const execute=process.argv.includes("--execute"),resume=process.argv.includes("--resume");
 if(!execute){console.log("DRY RUN: verified database backup; rotate WHATSAPP_WORKER_SECRET and DEMO_PASSWORD only; update existing marked demo Auth users; revoke sessions; build/start; validate login and simulator. SUPABASE_SECRET_KEY unchanged. No values printed.");return;}
 const stateFile=path.join(LOCAL_STATE_DIR,"processes.json");
 const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,"utf8")):{};
 if([state.supervisor,state.app,state.worker,state.printWorker,state.licenseWorker].some(isProcessRunning))throw Error("Stop application and workers before maintenance");
 const envFile=path.join(ROOT,".env.local"),journalFile=path.join(LOCAL_STATE_DIR,"credential-rotation.json");
 fs.mkdirSync(LOCAL_STATE_DIR,{recursive:true});
 let journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile,"utf8")):null;
 if(journal&&journal.stage!=="complete"&&!resume)throw Error("Incomplete maintenance exists; use --resume without generating another password");
 if(resume&&(!journal||journal.stage==="complete"))throw Error("No incomplete maintenance to resume");
 runSupabase(["start"],{capture:true,timeout:300000});
 const env=loadEnvFile();
 assertLocalTarget(env.NEXT_PUBLIC_SUPABASE_URL);
 if(env.APP_MODE!=="local"||env.WHATSAPP_MOCK!=="true"||!env.DEMO_PASSWORD||!env.WHATSAPP_WORKER_SECRET)throw Error("Explicit local mock environment required");
 const admin=client(env,env.SUPABASE_SECRET_KEY),makePublicClient=()=>client(env,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
 const users=[];
 for(let page=1;page<=100;page++){
  const data=required(await admin.auth.admin.listUsers({page,perPage:100}));
  for(const user of data.users)if(DEMO_EMAILS.includes(user.email)){
   const profile=required(await admin.from("profiles").select("full_name").eq("id",user.id).single());
   if(!profile.full_name?.startsWith("[DEMO]"))throw Error("Demo identity is not marked; manual review required");
   users.push({id:user.id,email:user.email});
  }
  if(data.users.length<100)break;
 }
 if(users.length!==DEMO_EMAILS.length)throw Error("Expected demo account set is incomplete");
 if(!resume){
  const backup=await createBackup({reason:"before-authorized-test-credential-rotation"});await validateBackup(backup);
  journal={id:randomUUID(),stage:"prepared",backup,started_at:new Date().toISOString()};
  atomic(journalFile,JSON.stringify(journal,null,2));
 }else await validateBackup(journal.backup);
 const source=fs.readFileSync(envFile,"utf8"),marker="# credential-rotation "+journal.id;
 const alreadySelected=source.includes(marker);
 if(!alreadySelected){
  const changed=replaceAssignments(source,{WHATSAPP_WORKER_SECRET:randomBytes(32).toString("hex"),DEMO_PASSWORD:"Mc!"+randomBytes(24).toString("base64url")});
  atomic(envFile,changed.trimEnd()+"\n"+marker+"\n");
 }
 const next=loadEnvFile();
 if(next.SUPABASE_SECRET_KEY!==env.SUPABASE_SECRET_KEY)throw Error("Provider key must remain unchanged");
 const runtimeFile=path.join(LOCAL_STATE_DIR,"runtime.json"),runtime=fs.existsSync(runtimeFile)?JSON.parse(fs.readFileSync(runtimeFile,"utf8")):{};
 runtime.whatsappWorkerSecret=next.WHATSAPP_WORKER_SECRET;atomic(runtimeFile,JSON.stringify(runtime,null,2));
 journal.stage="auth";atomic(journalFile,JSON.stringify(journal,null,2));
 const result=await rotateAuthUsers({admin,users,password:next.DEMO_PASSWORD,makePublicClient,oldPassword:alreadySelected?undefined:env.DEMO_PASSWORD});
 journal.stage="restart";journal.validation=result;atomic(journalFile,JSON.stringify(journal,null,2));
 run(process.execPath,["scripts/next-command.mjs","build"],{env:next,capture:true,timeout:600000});
 run(process.execPath,["scripts/local/start.mjs"],{env:next,capture:true,timeout:360000});
 const base=next.NEXT_PUBLIC_APP_URL;
 const post=(route,secret,body={})=>fetch(base+route,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+secret},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 if(!alreadySelected){
  const old=await post("/api/whatsapp/process",env.WHATSAPP_WORKER_SECRET);if(old.status!==403)throw Error("Old worker bearer not rejected");
 }
 const simulated=await post("/api/whatsapp/simulate",next.WHATSAPP_WORKER_SECRET,{phone:"+595981"+String(Number.parseInt(randomBytes(3).toString("hex"),16)%1000000).padStart(6,"0"),message_id:"authorized-rotation:"+journal.id,text:"menu"});
 if(simulated.status!==200)throw Error("New simulator bearer validation failed");
 const response=await simulated.json();if(response.duplicate||!response.replies?.length)throw Error("Simulator did not complete a new conversation");
 journal.stage="complete";journal.completed_at=new Date().toISOString();journal.validation={...result,provider_key_unchanged:true,worker_runtime_synchronized:true,simulator_passed:true,old_worker_rejected:!alreadySelected};
 atomic(journalFile,JSON.stringify(journal,null,2));
 console.log(JSON.stringify(journal.validation));
 console.log("Rotation complete. Read DEMO_PASSWORD only in .env.local. Access JWTs may remain valid until expiry; refresh sessions were revoked.");
}
if(isMain(import.meta.url))rotateTestCredentials().catch(()=>{console.error("Credential maintenance failed. No values logged. Keep services stopped if incomplete; inspect only the stage in .local-secrets/credential-rotation.json and use --execute --resume after diagnosis.");process.exitCode=1;});
