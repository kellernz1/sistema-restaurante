import {databaseSql} from "../target-operations.mjs";
import {createDisposableTarget,activateDisposableTarget,bindTarget,resolveTarget} from "../target-safety.mjs";

import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import {spawn}from "../target-process.mjs";
import {randomBytes,randomInt}from "node:crypto";
import {createClient}from "../target-client.mjs";
import {ROOT,parseEnv,run,isWindows,isProcessRunning} from "../local/lib.mjs";
import {runSupabase} from "../target-operations.mjs";
import {seedTestLicense}from "../../tests/helpers/license-fixture.mjs";

// No development environment file, database URL, build output or operations directory is reused.
const id=randomBytes(12).toString("hex"),project=`mesa-it-${id}`;
const directory=path.join(ROOT,"artifacts","integration",id),app=path.join(directory,"app"),logs=path.join(directory,"logs");
fs.mkdirSync(logs,{recursive:true});
const children=new Set();let started=false,mock;
function ownedCommand(binary,args,{cwd=ROOT,env={},input,log="command"}={}){
 return new Promise((resolve,reject)=>{
  const output=fs.openSync(path.join(logs,log+".log"),"a");
  const child=spawn(binary,args,{cwd,env:{...process.env,...env,NEXT_TELEMETRY_DISABLED:"1"},windowsHide:true,stdio:["pipe",output,output]});children.add(child);
  const timer=setTimeout(()=>{if(isWindows)run("taskkill",["/PID",String(child.pid),"/T","/F"],{capture:true,allowFailure:true});else child.kill("SIGTERM");},600000);
  child.on("error",reject);child.on("close",code=>{clearTimeout(timer);children.delete(child);fs.closeSync(output);if(code===0)resolve();else reject(Error(`${log} failed (${code}); see ${path.join(logs,log+".log")}`));});child.stdin.end(input);
 });
}
async function ports(){for(let attempt=0;attempt<30;attempt++){
 const base=randomInt(2000,4900)*10,servers=[];
 try{for(let offset=0;offset<5;offset++){const server=net.createServer();await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(base+offset,"127.0.0.1",resolve);});servers.push(server);}return base;}
 catch{/* Try a different complete block without disturbing an existing listener. */}
 finally{await Promise.all(servers.map(s=>new Promise(resolve=>s.close(resolve))));}
 }throw Error("No free integration port block");}
const base=await ports(),apiPort=base,dbPort=base+1,appPort=base+3;
const targetOwner=createDisposableTarget({root:app,runDirectory:directory,project,apiPort,dbPort,appPort});
activateDisposableTarget(targetOwner.context);
const marker={project,apiPort,dbPort,appPort,nonce:randomBytes(24).toString("hex"),active:false};
fs.writeFileSync(path.join(directory,"owner.json"),JSON.stringify(marker));
const cli=args=>runSupabase(resolveTarget(),[...args,"--workdir",app],{capture:true,allowFailure:true,timeout:600000});
function checkedCli(args){const r=cli(args);if(args[0]!=="status")fs.appendFileSync(path.join(logs,"supabase.log"),r.stdout+r.stderr);if(r.status!==0)throw Error("Temporary Supabase command failed; see ignored supabase.log");return r.stdout;}
function assertOwned(){if(path.dirname(directory)!==path.join(ROOT,"artifacts","integration")||path.dirname(path.resolve(app))!==directory||JSON.parse(fs.readFileSync(path.join(directory,"owner.json"),"utf8")).project!==project||!/^mesa-it-[a-f0-9]{24}$/.test(project))throw Error("Refusing unsafe integration cleanup");}
async function stopChildren(){for(const child of children)if(child.pid){if(isWindows)run("taskkill",["/PID",String(child.pid),"/T","/F"],{capture:true,allowFailure:true});else child.kill("SIGTERM");}children.clear();}
let result="failed";
let interrupted=false;const interrupt=()=>{interrupted=true;void stopChildren();};
process.once("SIGINT",interrupt);process.once("SIGTERM",interrupt);
try{
 fs.mkdirSync(app,{recursive:true});
 for(const entry of ["src","public","scripts","supabase","package.json","package-lock.json","next.config.ts","tsconfig.json","postcss.config.mjs"]){const source=path.join(ROOT,entry);if(fs.existsSync(source))fs.cpSync(source,path.join(app,entry),{recursive:true,filter:p=>!/[\\/]supabase[\\/]\.(temp|branches)([\\/]|$)/.test(p)});}
 fs.symlinkSync(path.join(ROOT,"node_modules"),path.join(app,"node_modules"),isWindows?"junction":"dir");
 const config=path.join(app,"next.config.ts");fs.writeFileSync(config,fs.readFileSync(config,"utf8").replace("root: process.cwd()",`root: ${JSON.stringify(ROOT)}`));
 fs.writeFileSync(path.join(app,"supabase","config.toml"),`project_id = "${project}"
[api]
enabled = true
port = ${apiPort}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
[db]
port = ${dbPort}
shadow_port = ${base+2}
major_version = 15
[db.seed]
enabled = false
[studio]
enabled = false
[inbucket]
enabled = false
[storage]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
[auth]
enabled = true
site_url = "http://127.0.0.1:${appPort}"
enable_signup = false
[auth.email]
enable_signup = true
enable_confirmations = false
[auth.rate_limit]
sign_in_sign_ups = 10000
token_refresh = 10000
`);
 console.log(`Provisioning isolated Supabase ${project}; development services remain untouched.`);
 started=true;checkedCli(["start"]);
 const names=run("docker",["ps","--format","{{.Names}}"],{capture:true}).stdout.trim().split(/\r?\n/);
 const container=names.find(name=>name===`supabase_db_${project}`);
 if(!container)throw Error("Owned database container not found: "+names.filter(n=>n.startsWith("supabase_db_")).join(", "));
 checkedCli(["migration","up","--local"]);
 const status=parseEnv(checkedCli(["status","-o","env"]));
 if(interrupted||status.API_URL!==`http://127.0.0.1:${apiPort}`||new URL(status.DB_URL).port!==String(dbPort))throw Error("Temporary CLI target mismatch or interrupted setup");
 const env={INTEGRATION_RUN_DIR:directory,INTEGRATION_NONCE:marker.nonce,NEXT_PUBLIC_APP_URL:`http://127.0.0.1:${appPort}`,PUBLIC_TEST_URL:`http://127.0.0.1:${appPort}`,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${apiPort}`,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,SUPABASE_SECRET_KEY:status.SERVICE_ROLE_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,APP_MODE:"local",WHATSAPP_MOCK:"true",WHATSAPP_WORKER_SECRET:randomBytes(32).toString("hex"),WHATSAPP_APP_SECRET:randomBytes(32).toString("hex"),WHATSAPP_VERIFY_TOKEN:randomBytes(32).toString("hex"),WHATSAPP_PHONE_NUMBER_ID:"integration-local",CONTACT_HTTP_TEST:"true",DELIVERY_ROUTE_SMOKE:"true",DELIVERY_ROUTING_URL:`http://127.0.0.1:${base+4}`,DEMO_PASSWORD:"Integration@"+randomBytes(10).toString("hex")};
 env.WEBHOOK_TEST_SECRET=env.WHATSAPP_APP_SECRET;env.WEBHOOK_TEST_TOKEN=env.WHATSAPP_VERIFY_TOKEN;env.LICENSE_PUBLIC_KEY="";
 env.INTEGRATION_DB_PASSWORD=decodeURIComponent(new URL(status.DB_URL).password);
 if(!status.ANON_KEY||!status.SERVICE_ROLE_KEY)throw Error("Temporary API credentials unavailable");
 bindTarget(targetOwner.context,{apiKey:status.SERVICE_ROLE_KEY,publicKey:status.ANON_KEY,dbPassword:env.INTEGRATION_DB_PASSWORD});
 const sql=source=>ownedCommand("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],{input:source,log:"fixtures"});
 bindTarget(targetOwner.context,{installationId:(await databaseSql(targetOwner.context,"select installation_id from public.license_installation where id")).trim()});
 const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 // Exercise the public empty-development command before installing any test fixtures.
 await ownedCommand(process.execPath,["scripts/local/setup.mjs","--no-demo","--ip","127.0.0.1"],{cwd:app,log:"empty-setup"});
 const emptyUsers=await service.auth.admin.listUsers();
 const emptyProducts=await service.from("products").select("id",{count:"exact",head:true});
 if(emptyUsers.error||emptyUsers.data.users.length||emptyProducts.error||emptyProducts.count)throw Error("No-demo setup created Auth users or menu records");
 if(parseEnv(fs.readFileSync(path.join(app,".env.local"),"utf8")).DEMO_PASSWORD)throw Error("No-demo setup created a demonstration password");
 console.log("No-demo setup verified: zero Auth accounts, zero products, no demonstration password.");
 await sql(fs.readFileSync(path.join(ROOT,"supabase/seed.sql"),"utf8"));
 for(const [name,role]of [["admin","admin"],["caixa","cashier"],["cozinha","kitchen"],["garcom","waiter"],["garcom2","waiter"]]){
  const r=await service.auth.admin.createUser({email:`${name}@restaurante.local`,password:env.DEMO_PASSWORD,email_confirm:true,user_metadata:{full_name:`Integration ${name}`}});if(r.error)throw r.error;
  const p=await service.from("profiles").update({role}).eq("id",r.data.user.id);if(p.error)throw p.error;
 }
 marker.active=true;fs.writeFileSync(path.join(directory,"owner.json"),JSON.stringify(marker));
 const priorEnvironment={INTEGRATION_RUN_DIR:process.env.INTEGRATION_RUN_DIR,INTEGRATION_NONCE:process.env.INTEGRATION_NONCE,NEXT_PUBLIC_APP_URL:process.env.NEXT_PUBLIC_APP_URL,PUBLIC_TEST_URL:process.env.PUBLIC_TEST_URL,NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL};
 try{Object.assign(process.env,{INTEGRATION_RUN_DIR:directory,INTEGRATION_NONCE:marker.nonce,NEXT_PUBLIC_APP_URL:env.NEXT_PUBLIC_APP_URL,PUBLIC_TEST_URL:env.PUBLIC_TEST_URL,NEXT_PUBLIC_SUPABASE_URL:env.NEXT_PUBLIC_SUPABASE_URL});await seedTestLicense(resolveTarget());}finally{for(const[k,v]of Object.entries(priorEnvironment)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 await sql(`update public.service_policy set uses_waiter=true;update public.cash_session_policy set single_open_session=false;
 update public.products set price=price*1000;
 update public.restaurant_settings set is_accepting_orders=true,pickup_enabled=true,delivery_enabled=true,whatsapp_enabled=true,enabled_payment_methods=array['cash','transfer','card','pix']::public.payment_method[],delivery_fee_mode='distance',delivery_fee=6000,min_delivery_order=25000,delivery_distance_step_fee=6000,delivery_origin_latitude=-25.3,delivery_origin_longitude=-57.6;
 insert into public.exchange_rates(rate,rounding,created_by)select 1400,'none',id from public.profiles where role='admin'limit 1;`);
 mock=http.createServer((request,response)=>{if(!request.url.startsWith("/route/v1/driving/")){response.writeHead(404).end();return;}response.setHeader("content-type","application/json");response.end(JSON.stringify({code:"Ok",routes:[{distance:2500,duration:600}],waypoints:[{distance:0},{distance:0}]}));});
 await new Promise((resolve,reject)=>{mock.once("error",reject);mock.listen(base+4,"127.0.0.1",resolve);});
 marker.active=true;fs.writeFileSync(path.join(directory,"owner.json"),JSON.stringify(marker));
 if(process.env.INTEGRATION_VALIDATE_SQL==="true"){
  console.log("Validating the clean SQL chain using only the temporary stack as provider...");
  await ownedCommand(process.execPath,["scripts/local/validate-clean-db.mjs"],{env,log:"sql"});
  console.log(fs.readFileSync(path.join(logs,"sql.log"),"utf8").slice(-1300));
 }
 // Only the copied app receives these settings; root .env.local is never read or edited.
 fs.writeFileSync(path.join(app,".env.local"),Object.entries(env).map(([k,v])=>`${k}=${v}`).join("\n"));
 console.log("Building the disposable app (separate .next and operations files)...");
 const next=path.join(ROOT,"node_modules","next","dist","bin","next");await ownedCommand(process.execPath,[path.join(path.dirname(process.execPath),"node_modules/npm/bin/npm-cli.js"),"run","build"],{cwd:app,env,log:"build"});
 // Exercise the real daily supervisor and its actual workers before fixture-driven HTTP tests.
 // PORT keeps the supervised Next process on this capability's allocated app port.
 const supervisorOutput=fs.openSync(path.join(logs,"supervisor-startup.log"),"a");
 const supervisor=spawn(process.execPath,["scripts/local/supervisor.mjs"],{cwd:app,env:{...process.env,...env,PORT:String(appPort)},stdio:["ignore",supervisorOutput,supervisorOutput],windowsHide:true});
 children.add(supervisor);supervisor.on("close",()=>{children.delete(supervisor);fs.closeSync(supervisorOutput);});
 await ownedCommand(process.execPath,["scripts/integration/process-smoke.mjs"],{env:{...env,PROCESS_SMOKE_SUPERVISOR_PID:String(supervisor.pid)},log:"process-smoke"});
 const supervisedState=JSON.parse(fs.readFileSync(path.join(app,".local-secrets","processes.json"),"utf8"));
 const supervisedPids=[supervisor.pid,...["app","worker","printWorker","licenseWorker"].map(name=>supervisedState[name])];
 console.log("Supervisor, app and all three workers passed startup/activity and 11-second liveness acceptance.");
 // Avoid background queue consumers racing with the following controlled print/lease fixtures.
 await stopChildren();
 for(let attempt=0;attempt<40&&supervisedPids.some(isProcessRunning);attempt++)await new Promise(resolve=>setTimeout(resolve,250));
 if(supervisedPids.some(isProcessRunning))throw Error("Owned supervised processes did not stop before HTTP fixtures");
 const output=fs.openSync(path.join(logs,"app.log"),"a");
 const server=spawn(process.execPath,[next,"start","--port",String(appPort),"--hostname","127.0.0.1"],{cwd:app,env:{...process.env,...env},stdio:["ignore",output,output],windowsHide:true});children.add(server);server.on("close",()=>{children.delete(server);fs.closeSync(output);});
 let healthy=false;for(let attempt=0;attempt<60;attempt++){try{healthy=(await fetch(env.PUBLIC_TEST_URL+"/api/health",{signal:AbortSignal.timeout(1000)})).ok;if(healthy)break;}catch{/* Wait for the private app. */}await new Promise(resolve=>setTimeout(resolve,500));}if(!healthy)throw Error("Temporary app health check failed");
 await ownedCommand(process.execPath,["scripts/local/verify-history.mjs"],{cwd:app,env,log:"history"});
 console.log("Disposable db:verify-history passed.");
 console.log("Running all HTTP/native suites against the disposable instance...");
 marker.active=true;fs.writeFileSync(path.join(directory,"owner.json"),JSON.stringify(marker));
 await ownedCommand(process.execPath,["scripts/integration/smoke-worker.mjs"],{env,log:"tests"});
 if(process.env.INTEGRATION_RESTORE==="true")await ownedCommand(process.execPath,["scripts/local/restore-drill.mjs"],{cwd:app,env,log:"restore"});
 if(process.env.INTEGRATION_VISUAL==="true"){await ownedCommand(process.execPath,["scripts/visual-smoke.mjs"],{env,log:"visual"});console.log(fs.readFileSync(path.join(logs,"visual.log"),"utf8").slice(-1800));}
 console.log(fs.readFileSync(path.join(logs,"tests.log"),"utf8").slice(-3500));result="passed";
}finally{
 marker.active=false;fs.writeFileSync(path.join(directory,"owner.json"),JSON.stringify(marker));
 await stopChildren();if(mock)await new Promise(resolve=>mock.close(resolve));
 assertOwned();if(started){const stopped=cli(["stop","--no-backup"]);if(stopped.status!==0)throw Error("Temporary Supabase cleanup failed; inspect owned project "+project);}
 for(const [kind,args]of [["containers",["ps","-a","--format","{{.Names}}"]],["volumes",["volume","ls","--format","{{.Name}}"]]]){
  const remaining=run("docker",args,{capture:true}).stdout.split(/\r?\n/).filter(name=>name.endsWith(project));if(remaining.length)throw Error(`Temporary ${kind} remain: ${remaining.join(", ")}`);
 }
 // Unlink the dependency junction before deleting the verified temporary application directory.
 const link=path.join(app,"node_modules");if(fs.existsSync(link))fs.unlinkSync(link);
 assertOwned();fs.rmSync(app,{recursive:true,force:true});
 fs.writeFileSync(path.join(directory,"result.json"),JSON.stringify({result,project,cleaned:true},null,2));
 console.log(`Disposable instance removed. Result: ${result}. Evidence: ${directory}`);
 process.removeListener("SIGINT",interrupt);process.removeListener("SIGTERM",interrupt);
}
