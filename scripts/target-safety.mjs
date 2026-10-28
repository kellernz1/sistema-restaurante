import fs from "node:fs";
import path from "node:path";
import {randomBytes,createHmac,timingSafeEqual} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createInterface} from "node:readline/promises";
import {pathToFileURL,fileURLToPath} from "node:url";
import os from "node:os";
import {AsyncLocalStorage} from "node:async_hooks";

// Capabilities are never reconstructed from a caller-supplied object.
const contexts=new WeakMap(),cache=new Map();
const directories=new WeakMap(),filesystemContexts=new Map();
const operationScope=new AsyncLocalStorage();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=()=>{throw Error("Target safety refused: missing, unauthorized or mixed installation context. No credentials logged.");};
const sign=(data,key)=>createHmac("sha256",key).update(JSON.stringify(data)).digest("hex");
const same=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const inside=(base,file)=>{const relative=path.relative(base,file);return relative===""||(!relative.startsWith(".."+path.sep)&&relative!==".."&&!path.isAbsolute(relative));};
const json=file=>JSON.parse(fs.readFileSync(file,"utf8"));
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
export function operationRequiresConfirmation(profile,operation,primary=true){return profile==="production"&&(primary||operation!=="migration")&&["demo","clear-demo","reset","migration","repair","replace"].includes(operation);}
function envFile(root){const file=path.join(root,".env.local");return fs.existsSync(file)?Object.fromEntries(fs.readFileSync(file,"utf8").split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1)];})):{};}

export function assertPlainPath(file){
 const absolute=path.resolve(file);let cursor=path.parse(absolute).root;
 for(const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)){
  cursor=path.join(cursor,part);
  let stat;try{stat=fs.lstatSync(cursor);}catch(error){if(error.code==="ENOENT")continue;throw error;}
  if(stat.isSymbolicLink())fail();if(path.resolve(fs.realpathSync.native(cursor)).toLowerCase()!==path.resolve(cursor).toLowerCase())fail();
 }
 return absolute;
}
function isTestInvocation(){return !!(process.env.NODE_TEST_CONTEXT||process.env.VITEST||process.env.NODE_ENV==="test"||process.env.INTEGRATION_RUN_DIR||process.argv.includes("--test")||/(?:^|[\\/])(?:[^\\/]*test[^\\/]*|restore-drill|validate-clean-db)\.mjs$/i.test(process.argv[1]??""));}
function isTestProcess(){return !!(isTestInvocation()||process.env.TARGET_CONTEXT_FILE);}
function publicContext(state,database=state.database){
 const ctx=Object.freeze({profile:state.profile,get ready(){return state.ready!==false;},get installationId(){return state.installationId;},root:state.root,project:state.project,container:state.container,database,apiUrl:state.apiUrl,appUrl:state.appUrl,dbPort:state.dbPort,backupDirectory:state.backupDirectory});
 contexts.set(ctx,{state,database});return ctx;
}
function persist(state){
 if(!state.file)return;
 const data={...state.data,databases:[...state.databases],installationId:state.installationId,keys:state.keys};
 const temp=state.file+".tmp";assertPlainPath(state.file);fs.writeFileSync(temp,JSON.stringify({data,signature:sign(data,state.token)}),{encoding:"utf8",mode:0o600,flag:"wx"});fs.renameSync(temp,state.file);state.data=data;
}

/** Controllers may create only a NEW, empty, separately owned disposable target. */
export function createDisposableTarget({root,runDirectory,project,apiPort,dbPort,appPort,filesystemOnly=false}){
 root=assertPlainPath(root);runDirectory=assertPlainPath(runDirectory);
 if(!inside(runDirectory,root)||root===runDirectory||!/^mesa-(it|rest)-[a-f0-9]{24}$/.test(project)||[apiPort,dbPort,appPort].some(p=>!Number.isInteger(p)||p<1024||[3000,54320,54321,54322,54323].includes(p))||new Set([apiPort,dbPort,appPort]).size!==3)fail();
 if(fs.existsSync(root)&&fs.readdirSync(root).length)fail();
 const nonce=randomBytes(32).toString("hex"),file=path.join(runDirectory,"target-owner.json");
 if(fs.existsSync(file))fail();
 fs.mkdirSync(root,{recursive:true});
 const data={v:1,profile:"disposable",root,runDirectory,project,container:`supabase_db_${project}`,database:"postgres",apiUrl:`http://127.0.0.1:${apiPort}`,appUrl:`http://127.0.0.1:${appPort}`,dbPort,owner:process.pid,controllerCwd:assertPlainPath(process.cwd()),expires:Date.now()+6*3600000,installationId:null,databases:["postgres"],keys:{},filesystemOnly};
 fs.writeFileSync(file,JSON.stringify({data,signature:sign(data,nonce)}),{encoding:"utf8",mode:0o600,flag:"wx"});
 const environment={TARGET_CONTEXT_FILE:file,TARGET_CONTEXT_TOKEN:nonce};
 Object.assign(process.env,environment);cache.clear();
 return {context:resolveTarget(),environment};
}
export function activateDisposableTarget(ctx){
 assertTarget(ctx);const s=contexts.get(ctx).state;if(s.profile!=="disposable"||s.filesystemOnly||s.proof)fail();
 for(const args of [["ps","-a","--format","{{.Names}}"],["volume","ls","--format","{{.Name}}"]]){
  const result=spawnSync("docker",args,{encoding:"utf8",windowsHide:true,timeout:15000});
  if(result.status!==0)throw Error("Disposable ownership requires a running Docker engine");
  if(result.stdout.split(/\r?\n/).some(name=>name.endsWith(s.project)||name.startsWith(s.project+"_")))fail();
 }
 s.proof=true;s.data.proof=true;persist(s);return ctx;
}
export function requireTransport(ctx){assertTarget(ctx);const s=contexts.get(ctx).state;if(s.profile==="disposable"&&!s.proof)fail();return ctx;}
export function createProductionTarget(root,{ip,apiPort,dbPort,appPort,backupDirectory}){
 root=assertPlainPath(root);
 if(isTestProcess()||fs.existsSync(path.join(root,".env.local"))||fs.existsSync(path.join(root,".local-secrets/provider.json")))fail();
 const directory=path.join(root,".local-secrets");assertPlainPath(directory);if(fs.existsSync(directory)&&fs.readdirSync(directory).length)fail();fs.mkdirSync(directory,{recursive:true});
 const token=randomBytes(32).toString("hex"),file=path.join(directory,"target-bootstrap.json"),project="mesa-rest-"+randomBytes(12).toString("hex");
 if(fs.existsSync(file))fail();
 const externalDirectory=assertPlainPath(backupDirectory);
 const data={v:1,profile:"production",root,runDirectory:root,project,container:`supabase_db_${project}`,database:"postgres",apiUrl:`http://${ip}:${apiPort}`,appUrl:`http://${ip}:${appPort}`,dbPort,owner:process.pid,controllerCwd:root,expires:Date.now()+2*3600000,installationId:null,databases:["postgres","template1"],keys:{},bootstrap:true,externalDirectory};
 fs.writeFileSync(file,JSON.stringify({data,signature:sign(data,token)}),{encoding:"utf8",mode:0o600,flag:"wx"});Object.assign(process.env,{TARGET_CONTEXT_FILE:file,TARGET_CONTEXT_TOKEN:token});
 const state={...data,file,token,data,keys:{},databases:new Set(data.databases),backupDirectory:path.join(root,"backups"),grants:new Set(["migration"]),cwd:root,manual:true};
 const ctx=publicContext(state);cache.set(file,ctx);return ctx;
}
export function resolveTarget({root=process.cwd(),allowOfflineBoot=false}={}){
 if(process.env.TARGET_CONTEXT_FILE){
  const file=assertPlainPath(process.env.TARGET_CONTEXT_FILE),token=process.env.TARGET_CONTEXT_TOKEN;if(!token)fail();
  const envelope=json(file),d=envelope.data;
  if(!same(envelope.signature,sign(d,token))||d.v!==1||!["disposable","production"].includes(d.profile)||d.expires<Date.now()||d.container!==`supabase_db_${d.project}`||!/^mesa-(it|rest)-[a-f0-9]{24}$/.test(d.project))fail();
  if(d.profile==="production"&&(isTestInvocation()||/(^|[\\/])artifacts([\\/]|$)/.test(d.root)))fail();
  for(const p of [d.root,d.runDirectory,d.controllerCwd])assertPlainPath(p);
  if(!inside(d.runDirectory,d.root)||path.dirname(file)!==(d.profile==="production"?path.join(d.root,".local-secrets"):d.runDirectory)||![d.root,d.controllerCwd].includes(path.resolve(process.cwd())))fail();
  if(!Number.isInteger(d.owner)||d.owner<=0)fail();try{process.kill(d.owner,0);}catch{fail();}
  if(d.profile==="disposable"&&([new URL(d.apiUrl).port,new URL(d.appUrl).port,String(d.dbPort)].some(p=>["3000","54320","54321","54322","54323"].includes(p))||new URL(d.apiUrl).hostname!=="127.0.0.1"||new URL(d.appUrl).hostname!=="127.0.0.1"||d.dbPort!==Number(new URL(d.apiUrl).port)+1))fail();
  for(const[k,url]of [["NEXT_PUBLIC_SUPABASE_URL",d.apiUrl],["NEXT_PUBLIC_APP_URL",d.appUrl],["PUBLIC_TEST_URL",d.appUrl]])if(process.env[k]&&process.env[k]!==url)fail();
  if(cache.has(file)){const ctx=cache.get(file);assertTarget(ctx);return ctx;}
  const state={...d,file,token,data:d,keys:d.keys,databases:new Set(d.databases),backupDirectory:path.join(d.root,"backups"),grants:new Set(),manual:d.profile==="production",cwd:path.resolve(process.cwd())};
  const ctx=publicContext(state);cache.set(file,ctx);return ctx;
 }
 root=assertPlainPath(root);
 if(isTestProcess()||/(^|[\\/])artifacts([\\/]|$)/.test(root))fail();
 if(cache.has(root))return cache.get(root);
 const env=envFile(root),production=env.INSTALLATION_MODE==="restaurant",profile=production?"production":"development";
 const requested=option("--installation-id");
 let automation,automationKey;
 const automationFile=path.join(root,".local-secrets/target-automation.json");
 if(fs.existsSync(automationFile)){
  automation=json(automationFile);const keyFile=path.join(root,".local-secrets/target-automation.key");
  automationKey=fs.existsSync(keyFile)?fs.readFileSync(assertPlainPath(keyFile),"utf8"):null;
  const valid=automationKey&&same(automation.signature,sign(automation.data,automationKey))&&automation.data.root===root;
  if(!valid){if(path.basename(process.argv[1]??"")!=="authorize-target.mjs")fail();automation=null;}
 }
 // No SQL, HTTP or filesystem writes are permitted before explicit development intent.
 if(!production&&!(process.argv.includes("--allow-development")&&uuid.test(requested??""))&&!automation)fail();
 const config=fs.readFileSync(path.join(root,"supabase/config.toml"),"utf8"),providerFile=path.join(root,".local-secrets/provider.json");
 const meta=production?json(providerFile):null;
 const project=meta?.project??config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1],dbPort=meta?.dbPort??Number(config.match(/\[db\][\s\S]*?\bport\s*=\s*(\d+)/)?.[1]);
 if(automation&&automation.data.project!==project)fail();
 if(!project||!dbPort||!env.NEXT_PUBLIC_SUPABASE_URL||!env.NEXT_PUBLIC_APP_URL||!env.SUPABASE_SECRET_KEY||!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||!env.LOCAL_DB_PASSWORD)fail();
 if(automation){const binding=sign({project,apiUrl:env.NEXT_PUBLIC_SUPABASE_URL,appUrl:env.NEXT_PUBLIC_APP_URL,dbPort,keys:{apiKey:env.SUPABASE_SECRET_KEY,publicKey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,dbPassword:env.LOCAL_DB_PASSWORD}},automationKey);if(binding!==automation.data.binding){if(path.basename(process.argv[1]??"")!=="authorize-target.mjs")fail();automation=null;}}
 if(meta&&(meta.root!==root||meta.kind!=="restaurant-compose-v1"||meta.apiUrl!==env.NEXT_PUBLIC_SUPABASE_URL||meta.appUrl!==env.NEXT_PUBLIC_APP_URL))fail();
 const container=`supabase_db_${project}`;
 const read=spawnSync("docker",["exec",container,"psql","-X","-q","-U","supabase_admin","-d","postgres","-Atc","begin transaction read only;select installation_id from public.license_installation where id;commit;"],{encoding:"utf8",windowsHide:true,timeout:10000});
 const bootAllowed=allowOfflineBoot&&automation?.data.operations.includes("runtime");
 const id=read.status===0?read.stdout?.trim():bootAllowed?automation.data.installationId:null;
 if(!uuid.test(id??"")||(!production&&id!==(requested??automation?.data.installationId))||(requested&&id!==requested))fail();
 const api=new URL(env.NEXT_PUBLIC_SUPABASE_URL),app=new URL(env.NEXT_PUBLIC_APP_URL);
 if(api.hostname!==app.hostname||api.username||api.password||app.username||app.password||api.search||api.hash||app.search||app.hash||(!production&&(api.port!=="54321"||app.port!=="3000")))fail();
 const probe="fetch(new URL('/rest/v1/rpc/license_status',process.env.MC_CONTEXT_URL),{headers:{apikey:process.env.MC_CONTEXT_KEY},signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)process.exit(1);const d=await r.json();if(!d.installation_id)process.exit(1);process.stdout.write(d.installation_id);}).catch(()=>process.exit(1));";
 const http=read.status===0?spawnSync(process.execPath,["-e",probe],{encoding:"utf8",windowsHide:true,timeout:7000,env:{...process.env,MC_CONTEXT_URL:api.origin,MC_CONTEXT_KEY:env.SUPABASE_SECRET_KEY}}):{status:1};
 if(http.status===0&&http.stdout.trim()!==id)fail();
 const ready=read.status===0&&http.status===0;if(!ready&&!bootAllowed)fail();
 if(automation&&automation.data.installationId!==id)fail();
 const state={profile,ready,root,project,container,database:"postgres",dbPort,apiUrl:env.NEXT_PUBLIC_SUPABASE_URL,appUrl:env.NEXT_PUBLIC_APP_URL,installationId:id,keys:{apiKey:env.SUPABASE_SECRET_KEY,publicKey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,dbPassword:env.LOCAL_DB_PASSWORD},backupDirectory:path.join(root,"backups"),externalDirectory:jsonIfExists(path.join(root,".local-secrets/operations/policy.json"))?.external_directory,databases:new Set(["postgres","template1"]),grants:new Set(),cwd:path.resolve(process.cwd()),manual:production||(process.argv.includes("--allow-development")&&requested===id),automation:automation?.data.operations??[],env};
 const ctx=publicContext(state);cache.set(root,ctx);return ctx;
}
function jsonIfExists(file){return fs.existsSync(file)?json(file):null;}
export function assertTarget(ctx){
 const item=contexts.get(ctx);if(!item)fail();const s=item.state;
 if(path.resolve(process.cwd())!==s.cwd)fail();
 for(const p of [s.root,s.backupDirectory])assertPlainPath(p);
 if(!s.databases.has(item.database))fail();
 if(s.file){const e=json(assertPlainPath(s.file));if(process.env.TARGET_CONTEXT_FILE!==s.file||process.env.TARGET_CONTEXT_TOKEN!==s.token||!same(e.signature,sign(e.data,s.token))||e.data.expires<Date.now()||e.data.root!==s.root||e.data.container!==s.container)fail();try{process.kill(e.data.owner,0);}catch{fail();}}
 else if(isTestProcess()&&!s.filesystemOnly)fail();
 return ctx;
}
export function createFilesystemTarget(directory){
 const root=assertPlainPath(directory),temporary=assertPlainPath(os.tmpdir());
 if(!inside(temporary,root)||root===temporary||!/^mesa-[A-Za-z0-9_-]+$/.test(path.basename(root)))fail();
 const key=root+"|"+process.cwd();if(filesystemContexts.has(key))return filesystemContexts.get(key);
 const state={profile:"disposable",filesystemOnly:true,root,runDirectory:root,project:"filesystem-only",container:null,database:"filesystem",installationId:null,backupDirectory:root,databases:new Set(["filesystem"]),keys:{},grants:new Set(),cwd:path.resolve(process.cwd())};const context=publicContext(state);filesystemContexts.set(key,context);return context;
}
export function authorizeOperation(ctx,operation){
 assertTarget(ctx);const s=contexts.get(ctx).state;
 if(s.ready===false&&operation!=="boot")fail();
 if(s.filesystemOnly&&!operation.startsWith("file"))fail();
 const active=operationScope.getStore(),delegated=active?.state===s&&active.operation==="backup"&&["backup","file","sql"].includes(operation);
 if(s.profile==="development"&&!s.manual&&!s.automation.includes(operation)&&!(operation==="boot"&&s.automation.includes("runtime"))&&!delegated)fail();
 if(operationRequiresConfirmation(s.policyProfile??s.profile,operation,itemIsPrimary(ctx))&&!s.grants.has(operation))fail();
 return ctx;
}
export function withTargetOperation(ctx,operation,callback){authorizeOperation(ctx,operation);if(operation!=="backup")fail();return operationScope.run({state:contexts.get(ctx).state,operation},callback);}
const itemIsPrimary=ctx=>contexts.get(ctx).database==="postgres";
export async function guardEntry(url,operation){if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===url){const ctx=resolveTarget();const file=fileURLToPath(url);const controller=["validate-clean-db.mjs","audit-history.mjs","restore-drill.mjs"].includes(path.basename(file));if(!inside(ctx.root,file)&&!controller)fail();await confirmDestructive(ctx,operation);authorizeOperation(ctx,operation);}}
export async function confirmDestructive(ctx,operation){
 assertTarget(ctx);const s=contexts.get(ctx).state;
 if(!operationRequiresConfirmation(s.policyProfile??s.profile,operation,itemIsPrimary(ctx)))return authorizeOperation(ctx,operation);
 if(option("--installation-id")!==s.installationId||!process.argv.includes("--allow-production-maintenance")||!process.stdin.isTTY)fail();
 const expected=`${operation.toUpperCase()} ${s.installationId}`,rl=createInterface({input:process.stdin,output:process.stdout});
 try{if((await rl.question(`Type ${expected}: `)).trim()!==expected)fail();}finally{rl.close();}
 s.grants.add(operation);return ctx;
}
export function targetKeys(ctx){assertTarget(ctx);return {...contexts.get(ctx).state.keys};}
export function validateTargetEnvironment(ctx,env={}){
 assertTarget(ctx);const keys=targetKeys(ctx);
 const expected={NEXT_PUBLIC_SUPABASE_URL:ctx.apiUrl,NEXT_PUBLIC_APP_URL:ctx.appUrl,PUBLIC_TEST_URL:ctx.appUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:keys.publicKey,NEXT_PUBLIC_SUPABASE_ANON_KEY:keys.publicKey,SUPABASE_SECRET_KEY:keys.apiKey,SUPABASE_SERVICE_ROLE_KEY:keys.apiKey,PGPASSWORD:keys.dbPassword,TARGET_CONTEXT_FILE:process.env.TARGET_CONTEXT_FILE,TARGET_CONTEXT_TOKEN:process.env.TARGET_CONTEXT_TOKEN};
 for(const[name,value]of Object.entries(expected))if(env[name]!==undefined&&value!==undefined&&env[name]!==value)fail();return ctx;
}
export function assertOwnedModule(ctx,url){assertTarget(ctx);if(!inside(ctx.root,fileURLToPath(url)))fail();return ctx;}
// A disposable target can exercise stricter production policy without becoming production.
export function productionPolicyTarget(ctx){assertTarget(ctx);const s=contexts.get(ctx).state;if(s.profile!=="disposable")fail();return publicContext({...s,policyProfile:"production",grants:new Set()},ctx.database);}
export function pendingBootTarget(ctx){assertTarget(ctx);const s=contexts.get(ctx).state;if(s.profile!=="disposable")fail();return publicContext({...s,ready:false},ctx.database);}
export async function verifyLiveTarget(ctx){
 requireTransport(ctx);const s=contexts.get(ctx).state;
 const read=spawnSync("docker",["exec",s.container,"psql","-X","-q","-U","supabase_admin","-d","postgres","-Atc","begin transaction read only;select installation_id from public.license_installation where id;commit;"],{encoding:"utf8",windowsHide:true,timeout:10000});
 if(read.status!==0||read.stdout.trim()!==s.installationId)fail();
 const response=await fetch(new URL("/rest/v1/rpc/license_status",s.apiUrl),{headers:{apikey:s.keys.apiKey},signal:AbortSignal.timeout(5000)});
 if(!response.ok)fail();const identity=await response.json();if(identity.installation_id!==s.installationId)fail();s.ready=true;return ctx;
}
export function bindTarget(ctx,keys){
 requireTransport(ctx);const s=contexts.get(ctx).state;if(!s.file)fail();
 if(keys.installationId!==undefined&&!uuid.test(keys.installationId))fail();
 if(keys.installationId&&s.installationId&&keys.installationId!==s.installationId)fail();
 if(keys.installationId){
  const read=spawnSync("docker",["exec",s.container,"psql","-X","-q","-U","supabase_admin","-d","postgres","-Atc","begin transaction read only;select installation_id from public.license_installation where id;commit;"],{encoding:"utf8",windowsHide:true,timeout:10000});
  if(read.status!==0||read.stdout.trim()!==keys.installationId)fail();
 }
 if(keys.installationId)s.installationId=keys.installationId;
 s.keys={...s.keys,...keys};persist(s);
}
export function allocateDatabase(ctx,kind){authorizeOperation(ctx,"sql");if(!["clean","history","restore","source","previous"].includes(kind))fail();const s=contexts.get(ctx).state,name=`mesa_${kind}_${randomBytes(12).toString("hex")}`;s.databases.add(name);persist(s);return publicContext(s,name);}
export function databaseTarget(ctx,name){assertTarget(ctx);const s=contexts.get(ctx).state;if(!s.databases.has(name))fail();if(name==="template1")authorizeOperation(ctx,"replace");return publicContext(s,name);}
export function targetPath(ctx,file,{external=false}={}){
 assertTarget(ctx);const s=contexts.get(ctx).state,absolute=assertPlainPath(file);
 const allowed=s.profile==="disposable"?[s.runDirectory]:[s.root,...(external&&s.externalDirectory?[s.externalDirectory]:[])];
 if(!allowed.some(base=>inside(assertPlainPath(base),absolute)))fail();return absolute;
}
export function directoryTarget(ctx,file,{external=false}={}){
 const directory=targetPath(ctx,file,{external}),value=Object.freeze({path:directory});directories.set(value,{state:contexts.get(ctx).state,path:directory,external});return value;
}
export function assertDirectory(ctx,directory){
 assertTarget(ctx);const stored=directories.get(directory);if(!stored||stored.state!==contexts.get(ctx).state)fail();return targetPath(ctx,stored.path,{external:stored.external});
}
export function authorizeAutomation(ctx,operations){
 authorizeOperation(ctx,"automation");const s=contexts.get(ctx).state;
 if(option("--installation-id")!==s.installationId)fail();
 if(s.profile==="disposable"||!operations.length||operations.some(op=>!["backup","runtime"].includes(op)))fail();
 const data={installationId:s.installationId,root:s.root,project:s.project,operations,grantedAt:new Date().toISOString()};
 const file=targetPath(ctx,path.join(s.root,".local-secrets/target-automation.json"));
 const keyFile=targetPath(ctx,path.join(s.root,".local-secrets/target-automation.key"));
 if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,randomBytes(32).toString("hex"),{encoding:"utf8",mode:0o600,flag:"wx"});
 const key=fs.readFileSync(keyFile,"utf8");if(!/^[a-f0-9]{64}$/.test(key))fail();
 data.binding=sign({project:s.project,apiUrl:s.apiUrl,appUrl:s.appUrl,dbPort:s.dbPort,keys:s.keys},key);
 fs.writeFileSync(file,JSON.stringify({data,signature:sign(data,key)}),{encoding:"utf8",mode:0o600});
}
export function requireAutomation(ctx,operation){assertTarget(ctx);const s=contexts.get(ctx).state;if(s.profile!=="disposable"&&!s.automation?.includes(operation))throw Error("Grant installation-bound automation explicitly before starting supervision");}
export function assertExecution(ctx,binary,args,{input,output}={}){
 requireTransport(ctx);
 const readClose=args.includes("psql")&&/^select max\(created_at\) from public\.cash_session_events where action='close'$/.test(args.at(-1));
 authorizeOperation(ctx,args.includes("pg_isready")?"boot":readClose?"runtime":"sql");const s=contexts.get(ctx).state;
 if(output)targetPath(ctx,output);
 if(binary==="docker"){
  const exec=args.indexOf("exec");if(exec>=0){const container=args.slice(exec+1).find(a=>String(a).startsWith("supabase_"));if(container!==s.container)fail();
   const joined=args.join(" ");if(/\b(createdb|dropdb)\b/.test(joined)){const name=args.at(-1);if(!s.databases.has(name)||name==="postgres"||name==="template1")fail();}
   const flag=args.findIndex(a=>["-d","--dbname"].includes(a)),inline=args.find(a=>String(a).startsWith("--dbname="));const name=flag>=0?args[flag+1]:inline?.split("=")[1];if(name&&!s.databases.has(name))fail();
  }else if(args.includes("restart")||args.includes("stop")){if(args.some(a=>String(a).startsWith("supabase_")&&!String(a).endsWith(s.project)))fail();}
 }
 if(input&&typeof input!=="string"&&!Buffer.isBuffer(input))fail();
 return ctx;
}
export function authorizeSql(ctx,source){
 authorizeOperation(ctx,"sql");
 if(/\b(drop|truncate)\b|alter\s+(?:table|database)[\s\S]*\b(drop|rename)\b/i.test(source)&&operationRequiresConfirmation(ctx.profile,"migration",itemIsPrimary(ctx)))authorizeOperation(ctx,"migration");
 return ctx;
}
export function targetFetch(ctx,input,init){
 requireTransport(ctx);authorizeOperation(ctx,"runtime");const url=new URL(typeof input==="string"?input:input.url??String(input));
 if(![new URL(ctx.apiUrl).origin,new URL(ctx.appUrl).origin].includes(url.origin))fail();
 return fetch(input,init);
}
