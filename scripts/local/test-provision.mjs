import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createClient} from "@supabase/supabase-js";
import {ROOT} from "./lib.mjs";
import {provision} from "./provision.mjs";
import {preflight,hostPreflightChecks} from "./preflight.mjs";
import {providerMetadata,providerCompose,providerSql,readProviderSecrets,generateProviderSecrets} from "./restaurant-provider.mjs";
import {licenseFixtures} from "../../tests/helpers/license-fixture.mjs";

async function ports(){for(let n=0;n<50;n++){const base=21000+Math.floor(Math.random()*2000)*10,servers=[];try{for(const port of [base,base+1,base+2]){const s=net.createServer();servers.push(s);await new Promise((resolve,reject)=>{s.once("error",reject);s.listen(port,"127.0.0.1",resolve);});}return base;}catch{/* Try an entirely separate block. */}finally{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}}throw Error("No disposable port block");}
const directory=path.join(ROOT,"artifacts/provision-tests",randomBytes(12).toString("hex")),root=path.join(directory,"app"),external=path.join(directory,"external"),base=await ports();
function developmentBoundary(){
 const dir=path.join(ROOT,"backups"),state=path.join(ROOT,".local-secrets/operations/state.json");
 return JSON.stringify({backups:fs.existsSync(dir)?fs.readdirSync(dir).sort():[],state:fs.existsSync(state)?fs.readFileSync(state,"utf8"):null});
}
const beforeBoundary=developmentBoundary();
fs.mkdirSync(root,{recursive:true});fs.mkdirSync(external,{recursive:true});
for(const item of ["src","scripts","supabase","infra","public","package.json","package-lock.json","next.config.ts","tsconfig.json","postcss.config.mjs"]){const from=path.join(ROOT,item);if(fs.existsSync(from))fs.cpSync(from,path.join(root,item),{recursive:true,filter:p=>!/[\\/]supabase[\\/]\.(temp|branches)([\\/]|$)/.test(p)});}
fs.symlinkSync(path.join(ROOT,"node_modules"),path.join(root,"node_modules"),process.platform==="win32"?"junction":"dir");
const nextConfig=path.join(root,"next.config.ts");
fs.writeFileSync(nextConfig,fs.readFileSync(nextConfig,"utf8").replace("root: process.cwd()",`root: ${JSON.stringify(ROOT)}`),"utf8");
const cfg={name:"Provision acceptance",adminName:"Restaurant Owner",adminEmail:"owner@provision.invalid",adminPassword:"Owner!9"+randomBytes(20).toString("base64url"),usesWaiter:false,tables:false,delivery:true,methods:["cash","pix"],rate:"1400",ip:"127.0.0.1",apiPort:base,dbPort:base+1,appPort:base+2,backupDirectory:external};
let success=false;
try{
 console.log("Provisioning a separate owned restaurant provider; no development or Windows writes.");
 const installed=await provision(root,cfg);const meta=providerMetadata(root),secrets=readProviderSecrets(root);
 assert.equal(Number(providerSql(root,"select count(*)from public.products")),0);assert.equal(Number(providerSql(root,"select count(*)from auth.users")),1);
 const other=generateProviderSecrets();for(const name of Object.keys(secrets))assert.ok(secrets[name]!==other[name],"Installation secrets must differ; values omitted");
 const signed=await createClient(meta.apiUrl,secrets.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}).auth.signInWithPassword({email:cfg.adminEmail,password:cfg.adminPassword});assert.ok(!signed.error&&signed.data.session,"Initial administrator login failed; values omitted");
 const service=createClient(meta.apiUrl,secrets.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),auth=createClient(meta.apiUrl,secrets.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 assert.ok(!(await auth.auth.setSession({access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token})).error);
 const f=licenseFixtures(installed.installation_id);assert.ok(!(await service.rpc("license_set_public_key",{p_hex:f.key})).error);assert.ok(!(await auth.rpc("license_import",{p_token:f.tokens.active})).error);
 const anonymous=createClient(meta.apiUrl,secrets.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const privateRows=await anonymous.from("profiles").select("id");assert.ok(privateRows.error||privateRows.data.length===0,"Anonymous private profile access must remain denied");
 await auth.realtime.setAuth(signed.data.session.access_token);
 let eventResolve;const event=new Promise(resolve=>{eventResolve=resolve;});
 const systems=[];let readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});
 const channel=auth.channel("provision-acceptance").on("system",{},payload=>{systems.push({status:payload.status,codes:String(payload.message??"").match(/\b[A-Z][A-Za-z]+(?:Error|Failed|Down|Timeout|Denied)\b/g)??[]});if(payload.status==="ok")readyResolve();}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"profiles",filter:"id=eq."+signed.data.user.id},()=>eventResolve());
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Owned provider Realtime subscription timeout")),20000);channel.subscribe(status=>{if(status==="SUBSCRIBED"){clearTimeout(timer);resolve();}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){clearTimeout(timer);reject(Error("Owned provider Realtime subscription failed"));}});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Owned provider replication readiness timeout")),30000);ready.then(()=>{clearTimeout(timer);resolve();});});
  providerSql(root,"update public.profiles set full_name='Acceptance realtime' where id='"+signed.data.user.id+"'");
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{fs.writeFileSync(path.join(directory,"realtime.json"),JSON.stringify(systems));reject(Error("Owned provider Realtime event timeout"));},60000);event.then(()=>{clearTimeout(timer);resolve();});});
 }finally{await auth.removeChannel(channel);auth.realtime.disconnect();}
 const hostChecks=async(r,m)=>({...await hostPreflightChecks(r,m),autostart:true});
 const healthy=await preflight(root,{hostChecks});fs.writeFileSync(path.join(directory,"preflight.json"),JSON.stringify(healthy,null,2));assert.ok(healthy.approved,"Provisioned preflight failed: "+healthy.checks.filter(c=>c.status==="fail").map(c=>c.name).join(","));
 const original=fs.readFileSync(path.join(root,".env.local"),"utf8");
 fs.appendFileSync(path.join(root,".env.local"),"DEMO_PASSWORD=fixture-only\n","utf8");
 assert.equal((await preflight(root,{hostChecks})).checks.find(c=>c.name==="no_demo").status,"fail");fs.writeFileSync(path.join(root,".env.local"),original,"utf8");
 const again=await provision(root,cfg,{skipBuild:true});assert.equal(again.already_provisioned,true);assert.equal(again.installation_id,installed.installation_id);
 providerCompose(root,["stop"]);providerCompose(root,["up","-d"]);
 const {waitProvider}=await import("./restaurant-provider.mjs");await waitProvider(root);
 const after=await service.auth.admin.listUsers();assert.ok(!after.error&&after.data.users.length===1,"Provider credentials must survive restart");
 // Prove unrelated credentials cannot authenticate, without exposing either credential.
 const rejected=await fetch(meta.apiUrl+"/rest/v1/profiles?select=id",{headers:{apikey:other.SUPABASE_SECRET_KEY}});assert.ok([401,403].includes(rejected.status));
 const dbProbe=spawnSync("docker",["exec",`supabase_db_${meta.project}`,"sh","-c",'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -d postgres -Atc "select 1"'],{encoding:"utf8",windowsHide:true});assert.equal(dbProbe.status,0,"Exclusive PostgreSQL password must authenticate");
 const dbRejected=spawnSync("docker",["exec","-i",`supabase_db_${meta.project}`,"sh","-c",'read -r PGPASSWORD;export PGPASSWORD;psql -h 127.0.0.1 -U postgres -d postgres -Atc "select 1"'],{input:other.POSTGRES_PASSWORD+"\n",encoding:"utf8",windowsHide:true});assert.notEqual(dbRejected.status,0,"Unrelated database password must be rejected");
 providerSql(root,"insert into public.categories(name)values('Acceptance');insert into public.products(name,price,category_id)select 'Acceptance',10000,id from public.categories limit 1");
 await assert.rejects(()=>provision(root,cfg,{skipBuild:true}),/Existing restaurant data refused/);
 const preserved=await provision(root,cfg,{skipBuild:true,confirmExisting:installed.installation_id});assert.equal(preserved.already_provisioned,true);assert.equal(Number(providerSql(root,"select count(*)from public.products")),1);
 let exposed=0;for(const name of ["db","auth","rest","realtime","kong"]){const logs=spawnSync("docker",["logs",`supabase_${name}_${meta.project}`],{encoding:"utf8",windowsHide:true,maxBuffer:20*1024*1024});const all=(logs.stdout??"")+(logs.stderr??"");exposed+=Object.values(secrets).filter(v=>v.length>12&&all.includes(v)).length;assert.equal(all.includes(cfg.adminPassword),false,"Password must not be logged");}assert.equal(exposed,0,"Provider secrets must not be logged");
 const evidence={passed:true,empty_menu:true,unique_credentials:true,first_admin_login:true,realtime_event:true,anonymous_rls:true,preflight_approved_with_simulated_autostart:true,demo_rejected:true,idempotent:true,existing_data_refused:true,restart_persists_credentials:true,postgres_unique_password:true,secrets_not_logged:true,windows_modified:false};
 assert.equal(developmentBoundary(),beforeBoundary,"Development backup/state boundary changed");evidence.development_backup_state_unchanged=true;
 fs.writeFileSync(path.join(directory,"result.json"),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));success=true;
}catch(error){
 const marker=path.join(root,".local-secrets/provision.json");const stage=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,"utf8")).stage:"before-provider";
 fs.writeFileSync(path.join(directory,"failure.json"),JSON.stringify({stage,error_type:error?.constructor?.name??"Error",source_location:String(error?.stack??"").match(/(?:provision|test-provision)\.mjs:\d+:\d+/)?.[0]??null,backup_frames:String(error?.message??"").match(/(?:backup|migration-history|operations-process|provision-backup)\.(?:mjs|ts):\d+:\d+/g)??[]}));
 console.error("Provision acceptance failed at stage "+stage+"; no input or provider values logged.");
 const allowed=["permission denied","password authentication failed","does not exist","connection refused","row-level security","could not","pg_dump","pg_restore"].filter(c=>String(error?.message??"").includes(c));console.error("Diagnostic categories: "+allowed.join(","));process.exitCode=1;
 console.error(String(error?.message??"").match(/permission denied for (?:schema|table|function|database|relation) [a-z_][a-z_0-9]*/i)?.[0]??"No database object diagnostic");
}
finally{
 if(!path.resolve(root).startsWith(path.resolve(ROOT,"artifacts/provision-tests")+path.sep))throw Error("Unsafe provider cleanup refused");
 if(providerMetadata(root))providerCompose(root,["down","--volumes"]);
 console.log("Owned restaurant provider removed; development untouched. Result: "+(success?"passed":"failed")+". Evidence: "+directory);
}
