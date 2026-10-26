import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ROOT, findDbContainer, runSupabase, loadEnvFile } from "./lib.mjs";
import { command } from "./operations-process.mjs";
import {integrationContext}from "../integration/context.mjs";

export function localMigrations(directory=path.join(ROOT,"supabase/migrations")) {
  const sqlFiles=fs.readdirSync(directory).filter(name=>name.endsWith(".sql"));
  if(sqlFiles.some(name=>!/^\d+_.+\.sql$/.test(name)))throw new Error("Invalid migration filename");
  const files=sqlFiles.sort();
  const seen=new Set();
  return files.map(file=>{
    const version=file.split("_")[0];
    if(seen.has(version))throw new Error(`Duplicate migration version: ${version}`);
    seen.add(version);
    return {version,name:file.slice(version.length+1,-4),file};
  });
}
export function compareHistory(files,rows) {
  const recorded=new Map(rows.map(row=>[row.version,row]));
  const versions=new Set(files.map(file=>file.version));
  const missing=files.filter(file=>!recorded.has(file.version));
  const orphaned=rows.filter(row=>!versions.has(row.version));
  const renamed=files.filter(file=>recorded.has(file.version)&&recorded.get(file.version).name!==file.name);
  return {ok:!missing.length&&!orphaned.length&&!renamed.length,files:files.length,registered:rows.length,missing,orphaned,renamed};
}
export async function readHistory(database="postgres",container=findDbContainer()) {
  if(database!=="postgres"&&!/^mesa_(history|clean|restore|source)_[a-f0-9]{24}$/.test(database))throw new Error("Unsafe history database");
  const args=["exec",container,"psql","-X","-U","supabase_admin","-d",database,"-At","-v","ON_ERROR_STOP=1","-c"];
  if((await command("docker",[...args,"select to_regclass('supabase_migrations.schema_migrations') is not null"],{timeout:15000})).trim()!=="t")return [];
  const result=await command("docker",[...args,"select coalesce(json_agg(json_build_object('version',version,'name',name) order by version),'[]') from supabase_migrations.schema_migrations"],{timeout:15000});
  return JSON.parse(result.trim());
}
export async function verifyHistory(database="postgres",container=findDbContainer()) {
  return compareHistory(localMigrations(),await readHistory(database,container));
}
export function isolatedDatabaseUrl(database) {
  if(!/^mesa_(history|clean|restore|source)_[a-f0-9]{24}$/.test(database))throw new Error("Official temporary migration requires an isolated database");
  const integration=process.env.INTEGRATION_RUN_DIR?integrationContext():null;
  const env=integration?{}:loadEnvFile();
  const url=new URL(`postgresql://postgres@127.0.0.1:${integration?.dbPort??54322}/${database}`);
  url.password=integration?process.env.INTEGRATION_DB_PASSWORD:(env.LOCAL_DB_PASSWORD||process.env.LOCAL_DB_PASSWORD||"postgres");
  url.searchParams.set("sslmode","disable");
  return url.toString();
}
export function migrateIsolated(database,{includeAll=false,through}={}) {
  let workdir;
  if(through){
    if(!localMigrations().some(file=>file.version===through))throw new Error("Unknown migration boundary");
    workdir=path.join(ROOT,"artifacts","migration-work",randomUUID());
    fs.mkdirSync(path.join(workdir,"supabase","migrations"),{recursive:true});
    fs.copyFileSync(path.join(ROOT,"supabase","config.toml"),path.join(workdir,"supabase","config.toml"));
    for(const migration of localMigrations().filter(file=>file.version<=through))fs.copyFileSync(path.join(ROOT,"supabase/migrations",migration.file),path.join(workdir,"supabase/migrations",migration.file));
  }
  const result=runSupabase(["migration","up","--db-url",isolatedDatabaseUrl(database),...(includeAll?["--include-all"]:[]),...(workdir?["--workdir",workdir]:[])],{capture:true,allowFailure:true,timeout:600000});
  if(result.status!==0)throw new Error(`Official migration failed: ${(result.stderr||result.stdout).replace(/postgres(?:ql)?:\/\/[^\s]+/g,"[redacted database URL]").slice(-5000)}`);
  return result.stdout;
}
