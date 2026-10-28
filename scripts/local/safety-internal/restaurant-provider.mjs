import {authorizeOperation,authorizeSql,targetPath,bindTarget,requireTransport} from "../../target-safety.mjs";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "../../target-process.mjs";
import {randomBytes,createHmac,createHash,randomUUID} from "node:crypto";

export const providerRevision="a18539886c23365720c84f3121e81698fb98899b";
export const providerImages={db:"public.ecr.aws/supabase/postgres:15.19.0.004",auth:"public.ecr.aws/supabase/gotrue:v2.197.0",rest:"public.ecr.aws/supabase/postgrest:v16.4",realtime:"public.ecr.aws/supabase/realtime:v2.143.4",kong:"public.ecr.aws/supabase/kong:2.8.1"};
export function providerMetadata(root){const p=path.join(root,".local-secrets/provider.json");if(!fs.existsSync(p))return null;const m=JSON.parse(fs.readFileSync(p,"utf8"));if(m.kind!=="restaurant-compose-v1"||!/^mesa-rest-[a-f0-9]{24}$/.test(m.project)||path.resolve(m.root)!==path.resolve(root))throw Error("Invalid restaurant provider ownership");return m;}
export function readProviderSecrets(root){const source=fs.readFileSync(path.join(root,".local-secrets/provider.env"),"utf8");return Object.fromEntries(source.split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1)];}));}
export function jwt(secret,role){const b=value=>Buffer.from(JSON.stringify(value)).toString("base64url"),now=Math.floor(Date.now()/1000);const payload=b({alg:"HS256",typ:"JWT"})+"."+b({iss:"supabase",role,iat:now,exp:now+10*365*86400});return payload+"."+createHmac("sha256",secret).update(payload).digest("base64url");}
export function generateProviderSecrets(){
 const hex=n=>randomBytes(n).toString("hex"),secret=hex(32);
 return {POSTGRES_PASSWORD:hex(32),JWT_SECRET:secret,ANON_KEY:jwt(secret,"anon"),SERVICE_ROLE_KEY:jwt(secret,"service_role"),SUPABASE_PUBLISHABLE_KEY:"sb_publishable_"+randomBytes(24).toString("base64url"),SUPABASE_SECRET_KEY:"sb_secret_"+randomBytes(32).toString("base64url"),REALTIME_DB_ENC_KEY:randomBytes(16).toString("base64url").slice(0,16),SECRET_KEY_BASE:hex(64),DASHBOARD_USERNAME:"disabled-"+randomUUID(),DASHBOARD_PASSWORD:hex(32),WHATSAPP_WORKER_SECRET:hex(32)};
}
export function secretFingerprints(secrets){return Object.fromEntries(Object.entries(secrets).map(([k,v])=>[k,createHash("sha256").update(v).digest("hex")]));}
export function writePrivate(context,file,content){
 authorizeOperation(context,"file");
targetPath(context,file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content,{flag:"wx",mode:0o600,encoding:"utf8"});}
export function prepareProviderCli(context,root){
 authorizeOperation(context,"file");

 const m=providerMetadata(root),directory=path.join(root,".local-secrets/provider-cli");if(!m)throw Error("Owned provider required");
 fs.mkdirSync(path.join(directory,"supabase/migrations"),{recursive:true});
 for(const file of fs.readdirSync(path.join(root,"supabase/migrations")))if(file.endsWith(".sql"))fs.copyFileSync(path.join(root,"supabase/migrations",file),path.join(directory,"supabase/migrations",file));
 fs.writeFileSync(path.join(directory,"supabase/config.toml"),`project_id = "${m.project}"\n[api]\nport = ${m.apiPort}\n[db]\nport = ${m.dbPort}\nshadow_port = ${m.dbPort===54322?54320:m.dbPort+10}\nmajor_version = 15\n[db.seed]\nenabled = false\n[studio]\nenabled = false\n[inbucket]\nenabled = false\n[storage]\nenabled = false\n[analytics]\nenabled = false\n[edge_runtime]\nenabled = false\n`,"utf8");
 return directory;
}
export function composeSpec(meta){
 const dbEnv={POSTGRES_PASSWORD:"${POSTGRES_PASSWORD}",PGPASSWORD:"${POSTGRES_PASSWORD}",PGOPTIONS:"-c log_statement=none -c log_min_error_statement=panic -c pgaudit.log=none",POSTGRES_DB:"postgres",POSTGRES_USER:"supabase_admin",JWT_SECRET:"${JWT_SECRET}",JWT_EXP:"3600"};
 const base=(name)=>({image:providerImages[name],container_name:`supabase_${name==="kong"?"kong":name}_${meta.project}`,restart:"unless-stopped",logging:{driver:"json-file",options:{"max-size":"5m","max-file":"3"}}});
 const dbUrl=role=>`postgres://${role}:`+"${POSTGRES_PASSWORD}@db:5432/postgres";
 return {name:meta.project,services:{
  db:{...base("db"),environment:dbEnv,ports:[`127.0.0.1:${meta.dbPort}:5432`],volumes:["./pg_hba.conf:/etc/mesa/pg_hba.conf:ro","db-data:/var/lib/postgresql/data","db-config:/etc/postgresql-custom","./roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro","./jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:ro","./realtime.sql:/docker-entrypoint-initdb.d/migrations/99-realtime.sql:ro"],command:["postgres","-c","config_file=/etc/postgresql/postgresql.conf","-c","hba_file=/etc/mesa/pg_hba.conf","-c","log_statement=none","-c","log_min_error_statement=panic","-c","pgaudit.log=none"],healthcheck:{test:["CMD","pg_isready","-h","127.0.0.1","-U","supabase_admin","-d","postgres"],interval:"2s",timeout:"5s",retries:60}},
  auth:{...base("auth"),depends_on:{db:{condition:"service_healthy"}},environment:{GOTRUE_API_HOST:"0.0.0.0",GOTRUE_API_PORT:"9999",API_EXTERNAL_URL:meta.apiUrl,GOTRUE_DB_DRIVER:"postgres",GOTRUE_DB_DATABASE_URL:dbUrl("supabase_auth_admin"),GOTRUE_SITE_URL:meta.appUrl,GOTRUE_DISABLE_SIGNUP:"true",GOTRUE_JWT_SECRET:"${JWT_SECRET}",GOTRUE_JWT_EXP:"3600",GOTRUE_JWT_ADMIN_ROLES:"service_role",GOTRUE_JWT_AUD:"authenticated",GOTRUE_JWT_DEFAULT_GROUP_NAME:"authenticated",GOTRUE_EXTERNAL_EMAIL_ENABLED:"true",GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:"false",GOTRUE_MAILER_AUTOCONFIRM:"true",GOTRUE_EXTERNAL_PHONE_ENABLED:"false",GOTRUE_PASSWORD_MIN_LENGTH:"12"}},
  rest:{...base("rest"),depends_on:{db:{condition:"service_healthy"}},environment:{PGRST_DB_URI:dbUrl("authenticator"),PGRST_DB_SCHEMAS:"public",PGRST_DB_EXTRA_SEARCH_PATH:"public,extensions",PGRST_DB_ANON_ROLE:"anon",PGRST_JWT_SECRET:"${JWT_SECRET}",PGRST_DB_USE_LEGACY_GUCS:"false",PGRST_ADMIN_SERVER_PORT:"3001"},command:["postgrest"]},
  realtime:{...base("realtime"),networks:{default:{aliases:["realtime-dev"]}},depends_on:{db:{condition:"service_healthy"}},environment:{PORT:"4000",DB_HOST:"db",DB_PORT:"5432",DB_USER:"supabase_admin",DB_PASSWORD:"${POSTGRES_PASSWORD}",DB_NAME:"postgres",DB_AFTER_CONNECT_QUERY:"SET search_path TO _realtime",DB_ENC_KEY:"${REALTIME_DB_ENC_KEY}",API_JWT_SECRET:"${JWT_SECRET}",SECRET_KEY_BASE:"${SECRET_KEY_BASE}",METRICS_JWT_SECRET:"${JWT_SECRET}",ERL_AFLAGS:"-proto_dist inet_tcp",DNS_NODES:"''",APP_NAME:"realtime",SEED_SELF_HOST:"true",RUN_JANITOR:"true",DISABLE_HEALTHCHECK_LOGGING:"true"}},
  kong:{...base("kong"),depends_on:["auth","rest","realtime"],ports:[`${meta.bind}:${meta.apiPort}:8000`],volumes:["./kong.yml:/home/kong/temp.yml:ro","./kong-entrypoint.sh:/home/kong/kong-entrypoint.sh:ro"],entrypoint:["sh","/home/kong/kong-entrypoint.sh"],environment:{KONG_DATABASE:"off",KONG_DECLARATIVE_CONFIG:"/usr/local/kong/kong.yml",KONG_DNS_ORDER:"LAST,A,CNAME",KONG_DNS_NOT_FOUND_TTL:"1",KONG_PLUGINS:"request-transformer,cors,key-auth,acl,basic-auth,request-termination,ip-restriction,post-function",KONG_PROXY_ACCESS_LOG:"off",KONG_NGINX_PROXY_PROXY_BUFFER_SIZE:"160k",KONG_NGINX_PROXY_PROXY_BUFFERS:"64 160k",SUPABASE_ANON_KEY:"${ANON_KEY}",SUPABASE_SERVICE_KEY:"${SERVICE_ROLE_KEY}",ANON_KEY_ASYMMETRIC:"${ANON_KEY}",SERVICE_ROLE_KEY_ASYMMETRIC:"${SERVICE_ROLE_KEY}",SUPABASE_PUBLISHABLE_KEY:"${SUPABASE_PUBLISHABLE_KEY}",SUPABASE_SECRET_KEY:"${SUPABASE_SECRET_KEY}",DASHBOARD_USERNAME:"${DASHBOARD_USERNAME}",DASHBOARD_PASSWORD:"${DASHBOARD_PASSWORD}"}},
 },volumes:{"db-data":{},"db-config":{}}};
}
export function providerCompose(context,args,{timeout=300000}={}){
 requireTransport(context);authorizeOperation(context,args[0]==="up"?"boot":"runtime");const root=context.root;

 const meta=providerMetadata(root);if(!meta||meta.project!==context.project||meta.apiUrl!==context.apiUrl||meta.dbPort!==context.dbPort)throw Error("Mixed restaurant provider refused");
 const r=spawnSync("docker",["compose","--project-name",meta.project,"--env-file",path.join(root,".local-secrets/provider.env"),"-f",path.join(root,".local-secrets/provider/compose.json"),...args],{encoding:"utf8",windowsHide:true,timeout,maxBuffer:20*1024*1024});
 if(r.status!==0)throw Error("Restaurant provider command failed; output suppressed to protect credentials");return r;
}
export function initializeProvider(context,root,templateRoot,{apiPort=54321,dbPort=54322,appPort=3000,ip="127.0.0.1",bind="0.0.0.0"}={}){
 authorizeOperation(context,"provision");

 if(path.resolve(root)!==context.root)throw Error("Mixed provider root");
 const project=context.project,secrets=generateProviderSecrets();
 const meta={kind:"restaurant-compose-v1",project,root:path.resolve(root),apiPort,dbPort,appPort,bind,apiUrl:`http://${ip}:${apiPort}`,appUrl:`http://${ip}:${appPort}`,revision:providerRevision,images:providerImages,created_at:new Date().toISOString(),fingerprints:secretFingerprints(secrets)};
 const dir=path.join(root,".local-secrets/provider");fs.mkdirSync(dir,{recursive:true});
 for(const file of ["roles.sql","jwt.sql","realtime.sql","kong.yml","kong-entrypoint.sh"]){
  const source=fs.readFileSync(path.join(templateRoot,file),"utf8");
  let content=source;
  if(file==="kong-entrypoint.sh")content=source.replace("exec /entrypoint.sh kong docker-start","exec /docker-entrypoint.sh kong docker-start");
  if(file==="kong.yml")content=source.replaceAll("realtime-dev.supabase-realtime:4000","realtime-dev:4000");
  if(file==="roles.sql")content="\\set pgpass `echo \"$POSTGRES_PASSWORD\"`\nselect format('alter role %I password %L',rolname,:'pgpass') from pg_roles where rolname in ('authenticator','pgbouncer','supabase_auth_admin','supabase_functions_admin','supabase_storage_admin')\\gexec\n";
  writePrivate(context,path.join(dir,file),content);
 }
 writePrivate(context,path.join(dir,"pg_hba.conf"),"local all supabase_admin trust\nlocal all all scram-sha-256\nhost all all 0.0.0.0/0 scram-sha-256\nhost all all ::/0 scram-sha-256\nhost replication all 0.0.0.0/0 scram-sha-256\nhost replication all ::/0 scram-sha-256\n");
 writePrivate(context,path.join(root,".local-secrets/provider.env"),Object.entries(secrets).map(([k,v])=>k+"="+v).join("\n")+"\n");
 writePrivate(context,path.join(root,".local-secrets/provider.json"),JSON.stringify(meta,null,2));
 writePrivate(context,path.join(dir,"compose.json"),JSON.stringify(composeSpec(meta),null,2));
 bindTarget(context,{apiKey:secrets.SUPABASE_SECRET_KEY,publicKey:secrets.SUPABASE_PUBLISHABLE_KEY,dbPassword:secrets.POSTGRES_PASSWORD});
 return meta;
}
export function providerSql(context,source){
 authorizeSql(context,source);
 authorizeOperation(context,"sql");const root=context.root;

 const m=providerMetadata(root);if(!m)throw Error("Owned provider required");
 const r=spawnSync("docker",["exec","-i",`supabase_db_${m.project}`,"psql","-X","-q","-U","supabase_admin","-d","postgres","-At","-v","ON_ERROR_STOP=1"],{input:source,encoding:"utf8",windowsHide:true,timeout:120000,maxBuffer:20*1024*1024});
 if(r.status!==0)throw Error("Owned provider SQL failed; diagnostic output suppressed");return r.stdout.trim();
}
export async function startProvider(context){
 authorizeOperation(context,"runtime");const root=context.root;

 providerCompose(context,["up","-d","--wait","db"]);
 const s=readProviderSecrets(root);if(!/^[a-f0-9]{64}$/.test(s.POSTGRES_PASSWORD))throw Error("Invalid provider password configuration");
 const roles=["postgres","supabase_admin","authenticator","pgbouncer","supabase_auth_admin","supabase_functions_admin","supabase_storage_admin","supabase_replication_admin"];
 // The CLI image is preinitialized; fresh self-hosted roles are hardened before APIs start.
 providerSql(context,"set log_statement='none';set log_min_error_statement='panic';"+roles.map(role=>`do $$begin if exists(select 1 from pg_roles where rolname='${role}')then alter role ${role} password '${s.POSTGRES_PASSWORD}';alter role ${role} set log_statement='none';alter role ${role} set log_min_error_statement='panic';alter role ${role} set pgaudit.log='none';end if;end $$;`).join(""));
 // Bootstrap needs elevated logging options. Ordinary maintenance connections must not inherit them.
 const file=path.join(root,".local-secrets/provider/compose.json"),spec=JSON.parse(fs.readFileSync(file,"utf8"));
 spec.services.db.environment.PGOPTIONS="";
 fs.writeFileSync(file,JSON.stringify(spec,null,2),{encoding:"utf8",mode:0o600});
 providerCompose(context,["up","-d"]);await waitProvider(root);
}
export async function waitProvider(root){
 const m=providerMetadata(root),s=readProviderSecrets(root),end=Date.now()+180000;
 while(Date.now()<end){try{const r=await fetch(m.apiUrl+"/auth/v1/health",{headers:{apikey:s.SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(5000)});if(r.ok)return;}catch{/* Retry isolated provider startup. */}await new Promise(r=>setTimeout(r,2000));}
 throw Error("Restaurant provider did not become healthy; no credentials logged");
}
