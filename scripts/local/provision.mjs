import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import {createHash} from "node:crypto";
import {createInterface} from "node:readline/promises";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";
import {ROOT,isMain,runSupabase,run} from "./lib.mjs";
import {initializeProvider,providerMetadata,readProviderSecrets,startProvider,providerSql} from "./restaurant-provider.mjs";

export const provisionSchema=z.object({name:z.string().trim().min(1).max(100),adminName:z.string().trim().min(1).max(100),adminEmail:z.email(),adminPassword:z.string().min(12).max(128).refine(v=>/[a-z]/.test(v)&&/[A-Z]/.test(v)&&/[0-9]/.test(v)&&/[^A-Za-z0-9]/.test(v)),phoneCountry:z.enum(["PY","BR"]).default("PY"),currency:z.literal("PYG").default("PYG"),timezone:z.string().default("America/Asuncion").refine(v=>{try{new Intl.DateTimeFormat("en",{timeZone:v});return true;}catch{return false;}}),usesWaiter:z.boolean(),tables:z.boolean(),tableCount:z.number().int().min(0).max(200).default(0),delivery:z.boolean(),methods:z.array(z.enum(["cash","transfer","card","pix"])).min(1).refine(v=>new Set(v).size===v.length),rate:z.string().regex(/^\d{1,8}(?:\.\d{1,8})?$/).refine(v=>Number(v)>=0.01&&Number(v)<=100000000),rounding:z.enum(["none","half_real","whole_real"]).default("none"),ip:z.string().refine(v=>net.isIP(v)===4),apiPort:z.number().int().min(1024).max(65535).default(54321),dbPort:z.number().int().min(1024).max(65535).default(54322),appPort:z.number().int().min(1024).max(65535).default(3000),backupDirectory:z.string().refine(v=>path.isAbsolute(v)),licensePublicKey:z.string().regex(/^(?:[a-fA-F0-9]{64})?$/).default("")}).strict().refine(v=>!v.usesWaiter||v.tables).refine(v=>!v.tables||v.tableCount>0).refine(v=>new Set([v.apiPort,v.dbPort,v.appPort]).size===3);
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const atomic=(file,value)=>{const tmp=file+".tmp";try{fs.writeFileSync(tmp,JSON.stringify(value,null,2),{flag:"wx",encoding:"utf8",mode:0o600});fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}};
export function configurationHash(config){const{adminPassword:ignored,...publicConfig}=config;void ignored;return createHash("sha256").update(JSON.stringify(publicConfig)).digest("hex");}
async function freePort(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once("error",()=>reject(Error("Required installation port is in use")));s.listen(port,"0.0.0.0",()=>s.close(resolve));});}
function businessData(root){return Number(providerSql(root,"select (select count(*)from public.orders)+(select count(*)from public.products)+(select count(*)from public.payments)+(select count(*)from public.cash_sessions)+(select count(*)from auth.users)-1"));}
export async function provision(root,input,{skipBuild=false,confirmExisting}={}){
 root=path.resolve(root);
 const parsed=provisionSchema.safeParse(input);if(!parsed.success)throw Error("Invalid provisioning input; review field requirements without logging input");const cfg=parsed.data;
 const stateFile=path.join(root,".local-secrets/provision.json"),state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,"utf8")):null;
 if(fs.existsSync(path.join(root,".env.local"))&&!state)throw Error("Existing installation refused; use a fresh checkout with no environment or data");
 if(state?.configuration_hash!==undefined&&state.configuration_hash!==configurationHash(cfg))throw Error("Existing provisioning configuration differs; no data was changed");
 if(state?.stage==="complete"){
  if(businessData(root)>0&&confirmExisting!==state.installation_id)throw Error("Existing restaurant data refused; explicit installation confirmation permits read-only inspection only");
  return {installation_id:state.installation_id,already_provisioned:true};
 }
 if(!fs.existsSync(path.join(root,"supabase/migrations")))throw Error("Fresh application checkout required");
 if(!fs.statSync(cfg.backupDirectory).isDirectory())throw Error("External backup directory must exist before provisioning");
 if(!state){
  for(const port of [cfg.apiPort,cfg.dbPort,cfg.appPort])await freePort(port);
  if(providerMetadata(root))throw Error("Untracked provider state refused");
  initializeProvider(root,path.join(ROOT,"infra/restaurant-provider"),{apiPort:cfg.apiPort,dbPort:cfg.dbPort,appPort:cfg.appPort,ip:cfg.ip});
  atomic(stateFile,{stage:"provider",configuration_hash:configurationHash(cfg),created_at:new Date().toISOString()});
 }
 await startProvider(root);
 const meta=providerMetadata(root),secrets=readProviderSecrets(root);
 runSupabase(["migration","up","--local","--workdir",root],{capture:true,timeout:600000});
 const ownedState=JSON.parse(fs.readFileSync(stateFile,"utf8"));ownedState.stage="administrator";atomic(stateFile,ownedState);
 const admin=createClient(meta.apiUrl,secrets.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const listed=await admin.auth.admin.listUsers({page:1,perPage:100});if(listed.error)throw Error("Unable to inspect initial Auth accounts");
 let user=listed.data.users[0];
 if(listed.data.users.length>1||(user&&user.email!==cfg.adminEmail))throw Error("Existing Auth users refused");
 if(!user){const created=await admin.auth.admin.createUser({email:cfg.adminEmail,password:cfg.adminPassword,email_confirm:true,user_metadata:{full_name:cfg.adminName}});if(created.error)throw Error("Initial administrator creation failed; no password logged");user=created.data.user;}
 if(!user)throw Error("Initial administrator unavailable");
 if(ownedState.stage!=="configured"&&Number(providerSql(root,"select count(*) from public.orders"))>0)throw Error("Business data appeared during provisioning; stopped");
 const methods=cfg.methods.map(literal).join(",");
 const appliedMarker="Mesa Certa provision "+configurationHash(cfg);
 const configured=providerSql(root,"select coalesce(shobj_description(oid,'pg_database'),'')from pg_database where datname='postgres'")===appliedMarker;
 if(!configured){
  providerSql(root,`begin;select pg_advisory_xact_lock(768921);update public.profiles set role='admin',is_active=true,full_name=${literal(cfg.adminName)} where id=${literal(user.id)};select set_config('request.jwt.claim.sub',${literal(user.id)},true);select set_config('request.jwt.claim.role','authenticated',true);update public.restaurant_settings set restaurant_name=${literal(cfg.name)},default_phone_country=${literal(cfg.phoneCountry)},business_timezone=${literal(cfg.timezone)},business_day_start='05:00',dine_in_qr_enabled=${cfg.tables},delivery_enabled=${cfg.delivery},pickup_enabled=true,whatsapp_enabled=false,is_accepting_orders=true,enabled_payment_methods=array[${methods}]::public.payment_method[],delivery_fee=0,min_delivery_order=0;update public.service_policy set uses_waiter=${cfg.usesWaiter},counter_enabled=true;select public.set_exchange_rate(${literal(cfg.rate)},${literal(cfg.rounding)});${cfg.tables?`insert into public.tables(table_number,capacity)select n,4 from generate_series(1,${cfg.tableCount})n on conflict(table_number)do nothing;`:""}comment on database postgres is ${literal(appliedMarker)};commit;`);
 }
 const auth=createClient(meta.apiUrl,secrets.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const signed=await auth.auth.signInWithPassword({email:cfg.adminEmail,password:cfg.adminPassword});if(signed.error||!signed.data.session)throw Error("Initial administrator login failed");
 const revoked=await admin.auth.admin.signOut(signed.data.session.access_token,"global");if(revoked.error)throw Error("Provisioning acceptance session could not be revoked");
 const installationId=providerSql(root,"select installation_id from public.license_installation where id");
 ownedState.stage="configured";ownedState.installation_id=installationId;atomic(stateFile,ownedState);
 const env={NEXT_PUBLIC_SUPABASE_URL:meta.apiUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:secrets.SUPABASE_PUBLISHABLE_KEY,SUPABASE_SECRET_KEY:secrets.SUPABASE_SECRET_KEY,NEXT_PUBLIC_APP_URL:meta.appUrl,NEXT_TELEMETRY_DISABLED:"1",APP_MODE:"local",INSTALLATION_MODE:"restaurant",WHATSAPP_MOCK:"false",WHATSAPP_WORKER_SECRET:secrets.WHATSAPP_WORKER_SECRET,PUBLIC_TRUST_PROXY:"false",LOCAL_LAN_IP:cfg.ip,LOCAL_DB_PASSWORD:secrets.POSTGRES_PASSWORD,LOCAL_DB_PORT:String(meta.dbPort),LICENSE_PUBLIC_KEY:cfg.licensePublicKey};
 const envFile=path.join(root,".env.local"),tmp=envFile+".provision.tmp";fs.writeFileSync(tmp,Object.entries(env).map(([k,v])=>k+"="+v).join("\n")+"\n",{encoding:"utf8",mode:0o600});fs.renameSync(tmp,envFile);
 fs.mkdirSync(path.join(root,".local-secrets/operations"),{recursive:true});
 fs.writeFileSync(path.join(root,".local-secrets/runtime.json"),JSON.stringify({whatsappWorkerSecret:secrets.WHATSAPP_WORKER_SECRET}),{encoding:"utf8",mode:0o600});
 fs.writeFileSync(path.join(root,".local-secrets/operations/policy.json"),JSON.stringify({external_directory:cfg.backupDirectory}),"utf8");
 const backup=run(process.execPath,["scripts/local/provision-backup.mjs"],{cwd:root,env,capture:true,allowFailure:true,timeout:600000});
 if(backup.status!==0){
  const frames=String(backup.stderr??"").match(/(?:backup|migration-history|operations-process|provision-backup)\.(?:mjs|ts):\d+:\d+/g)??[];
  const categories=["permission denied","password authentication failed","does not exist","connection refused","row-level security","could not","pg_dump","pg_restore","Unsupported or newer migration version","Backup manifest/checksum mismatch"].filter(code=>String(backup.stderr??"").includes(code));
  const object=String(backup.stderr??"").match(/permission denied for (?:schema|table|function|database|relation) [a-z_][a-z_0-9]*/i)?.[0]??"";
  throw Error("Owned provisioning backup failed; diagnostic frames: "+frames.join(",")+"; categories: "+categories.join(",")+"; "+object);
 }
 if(!skipBuild)run(process.execPath,["scripts/next-command.mjs","build"],{cwd:root,env,capture:true,timeout:600000});
 ownedState.stage="complete";ownedState.completed_at=new Date().toISOString();atomic(stateFile,ownedState);
 return {installation_id:installationId,already_provisioned:false};
}

async function passwordInput(prompt){
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error("Secure interactive terminal required; password arguments/files are not supported");
 process.stdout.write(prompt+": ");process.stdin.setRawMode(true);process.stdin.resume();
 try{return await new Promise((resolve,reject)=>{let value="";const onData=chunk=>{for(const c of chunk.toString("utf8")){if(c==="\u0003"){process.stdin.off("data",onData);reject(Error("Cancelled"));return;}if(c==="\r"||c==="\n"){process.stdin.off("data",onData);process.stdout.write("\n");resolve(value);return;}if(c==="\u007f"||c==="\b")value=value.slice(0,-1);else if(c>=" ")value+=c;}};process.stdin.on("data",onData);});}
 finally{process.stdin.setRawMode(false);process.stdin.pause();}
}
async function main(){
 const es=process.argv.includes("--es"),say=(pt,spanish)=>es?spanish:pt;
 if(fs.existsSync(path.join(ROOT,".env.local"))&&!providerMetadata(ROOT))throw Error("Existing development environment refused");
 const existing=fs.existsSync(path.join(ROOT,".local-secrets/provision.json"))?JSON.parse(fs.readFileSync(path.join(ROOT,".local-secrets/provision.json"),"utf8")):null;
 if(existing?.stage==="complete"){
  const at=process.argv.indexOf("--confirm-existing"),confirmation=at>=0?process.argv[at+1]:undefined;
  if(businessData(ROOT)>0&&confirmation!==existing.installation_id)throw Error("Existing data requires explicit installation confirmation; no reprovisioning is performed");
  console.log(say("Instalação já provisionada; nenhuma alteração. ID: ","Instalación ya aprovisionada; sin cambios. ID: ")+existing.installation_id);return;
 }
 console.log(say("Moeda-base: PYG, valores inteiros em guaraníes.","Moneda base: PYG, valores enteros en guaraníes."));
 const rl=createInterface({input:process.stdin,output:process.stdout});
 const ask=(pt,spanish)=>rl.question(say(pt,spanish)+": "),yes=async(pt,spanish)=>/^(s|sim|si|sí)$/i.test((await ask(pt,spanish)).trim());
 const input={};
 try{
  input.name=await ask("Nome do restaurante","Nombre del restaurante");input.adminName=await ask("Nome do primeiro administrador","Nombre del primer administrador");input.adminEmail=await ask("E-mail do administrador","Correo del administrador");
  input.phoneCountry=((await ask("País padrão do telefone (PY/BR)","País predeterminado del teléfono (PY/BR)"))||"PY").toUpperCase();input.currency="PYG";
  input.timezone=(await ask("Fuso horário (America/Asuncion)","Zona horaria (America/Asuncion)"))||"America/Asuncion";
  input.tables=await yes("Atende em mesas? (s/n)","¿Atiende mesas? (s/n)");input.tableCount=input.tables?Number(await ask("Quantidade de mesas","Cantidad de mesas")):0;
  input.usesWaiter=await yes("Usa garçom? (s/n)","¿Usa camarero? (s/n)");input.delivery=await yes("Faz entrega? (s/n)","¿Hace entregas? (s/n)");
  input.methods=(await ask("Pagamentos ativos, separados por vírgula: cash,transfer,card,pix","Pagos activos separados por coma: cash,transfer,card,pix")).split(",").map(v=>v.trim());
  input.rate=await ask("Cotação inicial: Gs por BRL, ponto decimal","Cambio inicial: Gs por BRL, punto decimal");
  input.ip=await ask("IP reservado do notebook na rede local","IP reservada del equipo en la red local");input.backupDirectory=await ask("Pasta existente de cópia externa do backup","Carpeta existente para copia externa del respaldo");
  input.licensePublicKey=(await ask("LICENSE_PUBLIC_KEY (opcional, deixe vazio para configurar depois)","LICENSE_PUBLIC_KEY (opcional, deje vacío para configurar después)")).trim();
 }finally{rl.close();}
 input.adminPassword=await passwordInput(say("Senha forte do administrador (mínimo 12 caracteres, maiúscula, minúscula, número e símbolo; entrada oculta)","Contraseña fuerte del administrador (mínimo 12 caracteres, mayúscula, minúscula, número y símbolo; entrada oculta)"));
 const confirmation=await passwordInput(say("Repita a senha","Repita la contraseña"));if(input.adminPassword!==confirmation)throw Error("Password confirmation differs");
 const result=await provision(ROOT,input);
 console.log(say("Provisionamento concluído. ID da instalação: ","Aprovisionamiento completado. ID de instalación: ")+result.installation_id);
 console.log(say("Emita e importe a licença em Configurações → Licença. Execute local:preflight antes de usar dados reais. Nenhum segredo foi exibido.","Emita e importe la licencia en Configuración → Licencia. Ejecute local:preflight antes de usar datos reales. No se mostró ningún secreto."));
}
if(isMain(import.meta.url))main().catch(()=>{console.error(process.argv.includes("--es")?"Aprovisionamiento rechazado o interrumpido. Use una instalación nueva; revise los requisitos y el estado local. No se mostró ningún secreto.":"Provisionamento recusado ou interrompido. Use uma instalação nova; confira os requisitos e o estado local. Nenhum segredo foi exibido.");process.exitCode=1;});
