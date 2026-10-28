import {allocateDatabase,guardEntry,resolveTarget,databaseTarget} from "../target-safety.mjs";


import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import { ROOT, findDbContainer, isMain } from "./lib.mjs";
import { localMigrations, readHistory, compareHistory, migrateIsolated } from "../target-operations.mjs";
import { createIsolatedDatabase, dropIsolatedDatabase, databaseSql } from "../target-operations.mjs";
await guardEntry(import.meta.url,"sql");


export function schemaDifferences(expected,actual) {
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const serialized=value=>JSON.stringify(canonical(value));
  const group=rows=>{
    const result=new Map();
    for(const row of rows){const key=row.category+"/"+row.key;const values=result.get(key)??[];values.push(row.value);result.set(key,values);}
    for(const values of result.values())values.sort((a,b)=>serialized(a).localeCompare(serialized(b)));
    return result;
  };
  const a=group(expected),b=group(actual),diff=[];
  for(const key of [...new Set([...a.keys(),...b.keys()])].sort())if(serialized(a.get(key)??[])!==serialized(b.get(key)??[]))diff.push({key,expected:a.get(key)??[],actual:b.get(key)??[]});
  return diff;
}
export async function snapshot(container,database) {
  const query=fs.readFileSync(path.join(ROOT,"scripts/local/schema-snapshot.sql"),"utf8");
  const text=await databaseSql(databaseTarget(resolveTarget(),database),`begin transaction read only; ${query} commit;`);
  const line=text.split(/\r?\n/).find(line=>line.startsWith("["));
  if(!line)throw new Error("Missing schema snapshot");
  return JSON.parse(line);
}
export async function configuration(container,database) {
  const result={};
  for(const table of ["restaurant_settings","service_policy","cash_session_policy","print_settings","print_devices","print_destinations","print_processor_lease"]){
    const value=await databaseSql(databaseTarget(resolveTarget(),database),`begin transaction read only; select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${table} t; commit;`);
    result[table]=JSON.parse(value.split(/\r?\n/).find(line=>line.startsWith("[")));
  }
  return result;
}
export function normalizeConfiguration(configuration) {
  const devices=new Map(configuration.print_devices.map(device=>[device.id,device.name]));
  return Object.fromEntries(Object.entries(configuration).map(([table,rows])=>[table,rows.map(row=>{
    const value={...row};delete value.created_at;delete value.updated_at;
    if(table==="print_devices"){delete value.id;delete value.last_success_at;}
    if(table==="print_destinations"){value.device=devices.get(value.device_id);delete value.device_id;}
    if(table==="print_processor_lease"){delete value.owner_id;delete value.expires_at;}
    return value;
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
}
export async function dataFingerprint(container,database) {
  const names=await databaseSql(databaseTarget(resolveTarget(),database),"select json_agg(tablename order by tablename) from pg_tables where schemaname='public';");
  const tables=JSON.parse(names.trim());
  const quote=name=>'"'+name.replaceAll('"','""')+'"';
  const queries=tables.map(table=>`select '${table.replaceAll("'","''")}' as name,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as hash from public.${quote(table)} t`);
  const value=await databaseSql(databaseTarget(resolveTarget(),database),`begin transaction read only;select jsonb_agg(to_jsonb(x) order by name) from (${queries.join(" union all ")}) x;commit;`);
  return JSON.parse(value.split(/\r?\n/).find(line=>line.startsWith("[")));
}
export async function auditHistory() {
  const container=findDbContainer(),database=allocateDatabase(resolveTarget(),"history").database;
  const directory=path.join(resolveTarget().root,"artifacts","migration-history",new Date().toISOString().replace(/[:.]/g,"-"));fs.mkdirSync(directory,{recursive:true});
  const files=localMigrations(),recorded=await readHistory("postgres",container);
  const history=compareHistory(files,recorded);
  fs.writeFileSync(path.join(directory,"history.json"),JSON.stringify({files,recorded,...history},null,2));
  const liveBefore=await snapshot(container,"postgres");
  await createIsolatedDatabase(databaseTarget(resolveTarget(),database));
  try {
    const log=migrateIsolated(databaseTarget(resolveTarget(),database));
    fs.writeFileSync(path.join(directory,"official-migrations.log"),log,"utf8");
    const officialHistory=await readHistory(database,container);
    if(!compareHistory(files,officialHistory).ok)throw new Error("Official clean history did not match local migrations");
    const clean=await snapshot(container,database),live=await snapshot(container,"postgres");
    const concurrent=schemaDifferences(liveBefore,live);
    if(concurrent.length)throw new Error("Development schema changed during read-only audit");
    const differences=schemaDifferences(clean,live);
    const configurations={clean:await configuration(container,database),development:await configuration(container,"postgres")};
    const normalized={clean:normalizeConfiguration(configurations.clean),development:normalizeConfiguration(configurations.development)};
    const configurationDifferences=Object.keys(normalized.clean).filter(table=>JSON.stringify(normalized.clean[table])!==JSON.stringify(normalized.development[table])).map(table=>({table,expected:normalized.clean[table],actual:normalized.development[table]}));
    const report={history,reference_database:database,official_history:officialHistory,identical_schema:!differences.length,differences,configurations,configuration_differences:configurationDifferences,files:files.map(file=>({...file,sha256:createHash("sha256").update(fs.readFileSync(path.join(ROOT,"supabase/migrations",file.file))).digest("hex")}))};
    for(const [name,value] of Object.entries({report,clean,development:live}))fs.writeFileSync(path.join(directory,`${name}.json`),JSON.stringify(value,null,2),"utf8");
    console.log(`History: ${recorded.length}/${files.length}; missing ${history.missing.length}; orphaned ${history.orphaned.length}.`);
    console.log(`Schema differences: ${differences.length}. Report: ${directory}`);
    return {directory,report};
  } finally {await dropIsolatedDatabase(databaseTarget(resolveTarget(),database));}
}
export async function assertInstalledSchema(database="postgres",container=findDbContainer()) {
  const rows=await readHistory(database,container),latest=rows.at(-1)?.version;
  if(!latest){
    const exists=(await databaseSql(databaseTarget(resolveTarget(),database),"select to_regclass('public.orders') is not null;")).trim();
    if(exists==="t")throw new Error("Installed application has no migration provenance. Audit before applying anything.");
    return;
  }
  const reference=allocateDatabase(resolveTarget(),"history").database;
  try {
    await createIsolatedDatabase(databaseTarget(resolveTarget(),reference));
    migrateIsolated(databaseTarget(resolveTarget(),reference),{through:latest});
    const differences=schemaDifferences(await snapshot(container,reference),await snapshot(container,database));
    if(differences.length)throw new Error(`Installed schema differs from its recorded migration prefix (${differences.length} differences). Run db:audit-history; no migration was applied.`);
  } finally {await dropIsolatedDatabase(databaseTarget(resolveTarget(),reference));}
}
if(isMain(import.meta.url))await auditHistory();
