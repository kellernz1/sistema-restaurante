import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {ROOT,isMain,loadEnvFile} from "./lib.mjs";
import {providerMetadata,readProviderSecrets,secretFingerprints,providerSql,composeSpec} from "./restaurant-provider.mjs";
import {compareHistory,localMigrations} from "./migration-history.mjs";
import {validateBackup} from "./backup.mjs";
import {operationsPolicySchema} from "../../src/lib/operations.ts";

export function evaluatePreflight(evidence){
 const checks=[];
 const check=(name,ok,cause)=>checks.push({name,status:ok?"pass":"fail",cause:ok?"verified":cause});
 check("restaurant_profile",evidence.restaurant,"Restaurant provider/profile not provisioned");
 check("no_demo",!evidence.demo,"Demo identity or DEMO_PASSWORD present");
 check("unique_secrets",evidence.unique,"Exclusive provider/worker secret provenance or live credential validation missing");
 check("studio_disabled",evidence.studioDisabled,"Studio is enabled or its absence could not be verified");
 check("administrative_ports",evidence.portsRestricted,"Administrative port restriction unverified; test from another device");
 check("recent_backup",evidence.backupValid,"Recent verified backup and external copy required");
 check("license",evidence.licenseValid,"Import a valid signed installation license");
 check("migration_history",evidence.history,"Official migration history differs or could not be verified");
 check("autostart",evidence.autostart,"Windows logon task missing, wrong target or unverified");
 check("license_mode",evidence.licenseMode,"Restaurant mode/license creation guards not verified");
 checks.push({name:"printer",status:evidence.physicalPrinter?"pass":"warning",cause:evidence.physicalPrinter?"configured":"Real printer/driver acceptance remains required; file/browser output is not physical validation"});
 return {approved:checks.every(c=>c.status!=="fail"),checks};
}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return fallback;}}
function envAt(root){return loadEnvFile(path.join(root,".env.local"));}
export async function hostPreflightChecks(root,meta){
 let autostart=false;
 if(process.platform==="win32"){
  const escaped=root.replaceAll("'","''"),source=`$t=Get-ScheduledTask -TaskName 'MesaCertaLocal' -ErrorAction SilentlyContinue;if($t -and $t.State -ne 'Disabled' -and ($t.Actions|Where-Object {$_.WorkingDirectory -eq '${escaped}' -and $_.Arguments -like '*scripts*local*start.mjs*'})){'verified'}`;
  const r=spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",source],{encoding:"utf8",windowsHide:true,timeout:15000});autostart=r.status===0&&r.stdout.trim()==="verified";
 }
 const r=spawnSync("docker",["inspect",`supabase_db_${meta.project}`,"--format","{{json .NetworkSettings.Ports}}"],{encoding:"utf8",windowsHide:true,timeout:10000});
 let portsRestricted=false;try{const ports=JSON.parse(r.stdout);portsRestricted=r.status===0&&ports["5432/tcp"]?.length>0&&ports["5432/tcp"].every(p=>["127.0.0.1","::1"].includes(p.HostIp));}catch{/* Fail closed. */}
 const names=spawnSync("docker",["ps","--filter",`label=com.docker.compose.project=${meta.project}`,"--format","{{.Names}}"],{encoding:"utf8",windowsHide:true,timeout:10000});
 return {autostart,portsRestricted,studioDisabled:names.status===0&&!/studio/i.test(names.stdout)};
}
export async function preflight(root=ROOT,{hostChecks=hostPreflightChecks}={}){
 root=path.resolve(root);const env=envAt(root),meta=providerMetadata(root);
 if(!meta)return evaluatePreflight({restaurant:false,demo:!!env.DEMO_PASSWORD,unique:false,licenseMode:false});
 let db={},history=false,unique=false,backupValid=false;
 const secrets=readProviderSecrets(root),expected=meta.fingerprints,actual=secretFingerprints(secrets);
 const complete=readJson(path.join(root,".local-secrets/provision.json"),{}).stage==="complete";
 try{
  db=JSON.parse(providerSql(root,"begin transaction read only;select json_build_object('demo',(select count(*) from public.profiles where full_name like '[DEMO]%' or id in(select id from auth.users where email like '%@restaurante.local')),'license',public.license_snapshot(),'guards',(select count(*) from pg_trigger where tgname in ('orders_license','order_items_license','qr_requests_license')),'devices',(select coalesce(json_agg(to_jsonb(d)),'[]')from public.print_devices d));commit;"));
  const rows=JSON.parse(providerSql(root,"select coalesce(json_agg(json_build_object('version',version,'name',name)),'[]')from supabase_migrations.schema_migrations"));history=compareHistory(localMigrations(path.join(root,"supabase/migrations")),rows).ok;
  const development=readJson(path.join(root,"infra/restaurant-provider/development-fingerprints.json"),{});
  unique=complete&&Object.keys(development).length===3&&Object.entries(development).every(([k,v])=>actual[k]!==v)&&Object.keys(expected).length>=10&&Object.entries(expected).every(([k,v])=>v===actual[k])&&secrets.POSTGRES_PASSWORD.length>=64&&secrets.JWT_SECRET.length>=64&&env.SUPABASE_SECRET_KEY===secrets.SUPABASE_SECRET_KEY&&env.WHATSAPP_WORKER_SECRET===secrets.WHATSAPP_WORKER_SECRET;
  const accepted=await fetch(meta.apiUrl+"/rest/v1/profiles?select=id&limit=1",{headers:{apikey:secrets.SUPABASE_SECRET_KEY},signal:AbortSignal.timeout(10000)});unique=unique&&accepted.ok;
 }catch{/* Unavailable evidence is a failure, never inferred from a marker alone. */}
 const host=await hostChecks(root,meta);
 const policy=readJson(path.join(root,".local-secrets/operations/policy.json"),{}),state=readJson(path.join(root,".local-secrets/operations/state.json"),{});
 try{
  const manifest=await validateBackup(state.file,{container:`supabase_db_${meta.project}`});
  const age=Date.now()-Date.parse(manifest.created_at),external=path.join(policy.external_directory,path.basename(state.file));
  const sum=file=>createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  backupValid=operationsPolicySchema.safeParse(policy).success&&state.result==="valid"&&age>=-300000&&age<=(policy.stale_hours??24)*3600000&&!!policy.external_directory&&state.external==="valid"&&sum(external)===manifest.sha256;
 }catch{/* Missing or unavailable external copy fails. */}
 const spec=composeSpec(meta),studioDisabled=host.studioDisabled&&!spec.services.studio;
 return evaluatePreflight({restaurant:complete,demo:!!env.DEMO_PASSWORD||Number(db.demo??1)>0,unique,studioDisabled,portsRestricted:host.portsRestricted,backupValid,licenseValid:["active","expiring"].includes(db.license?.state)&&!db.license?.requires_online,history,autostart:host.autostart,licenseMode:env.INSTALLATION_MODE==="restaurant"&&env.WHATSAPP_MOCK==="false"&&Number(db.guards)===3,physicalPrinter:(db.devices??[]).some(d=>!["browser","file-test","file_test"].includes(d.driver))});
}
export function printPreflight(result,es=false){
 const labels={restaurant_profile:["Perfil de restaurante provisionado","Perfil de restaurante aprovisionado"],no_demo:["Sem contas ou senha de demonstração","Sin cuentas ni contraseña de demostración"],unique_secrets:["Credenciais exclusivas verificadas","Credenciales exclusivas verificadas"],studio_disabled:["Studio desligado","Studio desactivado"],administrative_ports:["Portas administrativas restritas","Puertos administrativos restringidos"],recent_backup:["Backup recente e cópia externa verificados","Respaldo reciente y copia externa verificados"],license:["Licença assinada válida; importe antes do uso real","Licencia firmada válida; importe antes del uso real"],migration_history:["Histórico oficial de migrações íntegro","Historial oficial de migraciones íntegro"],autostart:["Partida automática instalada para esta pasta","Inicio automático instalado para esta carpeta"],license_mode:["Modo restaurante e bloqueios de licença ativos","Modo restaurante y controles de licencia activos"],printer:["Aceitação da impressora física pendente quando usar navegador/arquivo de teste","Aceptación de impresora física pendiente al usar navegador/archivo de prueba"]};
 console.log(es?(result.approved?"APROBADO":"REPROBADO"):(result.approved?"APROVADO":"REPROVADO"));
 for(const c of result.checks){const status=c.status==="pass"?"OK":c.status==="warning"?(es?"AVISO":"AVISO"):(es?"FALLO":"FALHA");console.log(status+" — "+(labels[c.name]?.[es?1:0]??c.name));}
}
if(isMain(import.meta.url))preflight().then(result=>{if(process.argv.includes("--json"))console.log(JSON.stringify(result,null,2));else printPreflight(result,process.argv.includes("--es"));if(!result.approved)process.exitCode=1;}).catch(()=>{console.error(process.argv.includes("--es")?"Preflight no disponible. No se mostró ningún secreto.":"Preflight indisponível. Nenhum segredo foi exibido.");process.exitCode=1;});
