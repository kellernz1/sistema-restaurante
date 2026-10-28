import {resolveTarget,databaseTarget,authorizeOperation,authorizeSql,targetPath,allocateDatabase,confirmDestructive} from "../../target-safety.mjs";
import fs from "node:fs";
import path from "node:path";
import { createBackup, validateBackup, assertVersion } from "./backup.mjs";
import { command } from "../operations-process.mjs";
import { confirmWord, isMain, readOption, loadEnvFile, isProcessRunning } from "../lib.mjs";
import { migrateIsolated, verifyHistory } from "./migration-history.mjs";
import { assertInstalledSchema } from "../audit-history.mjs";

export const temporaryDatabase = kind => allocateDatabase(resolveTarget(),kind).database;
export function assertTemporary(database) { if (!/^mesa_(restore|source)_[a-f0-9]{24}$/.test(database)) throw new Error("Refusing unsafe restore target"); }
export async function sql(context,source) {
 authorizeSql(context,source);
 authorizeOperation(context,"sql");const {container,database}=context;

  return command(context,"docker",["exec","-i",container,"psql","-X","-U","supabase_admin","-d",database,"-At","-v","ON_ERROR_STOP=1"],{input:source,timeout:120000});
}
export async function applyPending(context) {
 authorizeOperation(context,"migration");const {container,database}=context;

  assertTemporary(database);
  const versions = (await sql(databaseTarget(context,database),"select version from supabase_migrations.schema_migrations order by version;")).trim().split(/\s+/);
  for (const version of versions) assertVersion(version);
  const stagedQr=(await sql(databaseTarget(context,database),"select to_regclass('public.qr_requests') is not null;")).trim()==="t";
  if(stagedQr&&!versions.includes("202610250013"))throw new Error("Migration history is incomplete for the installed schema. Reconcile against a verified clean schema before migration; nothing is guessed or reapplied.");
  await assertInstalledSchema(database,container);
  migrateIsolated(databaseTarget(context,database));
  if(!(await verifyHistory(database,container)).ok)throw new Error("Restored migration history does not match files");
}
export async function inspectRestored(context) {
 authorizeOperation(context,"sql");const {database}=context;

  assertTemporary(database);
  const storagePresent=(await sql(databaseTarget(context,database),"select to_regclass('storage.objects') is not null;")).trim()==="t";
  const storageCount=storagePresent?Number((await sql(databaseTarget(context,database),"select count(*) from storage.objects;")).trim()):null;
  const tracked=(await sql(databaseTarget(context,database),"select to_regclass('supabase_migrations.schema_migrations') is not null;")).trim()==="t";
  const migration=tracked?(await sql(databaseTarget(context,database),"select max(version) from supabase_migrations.schema_migrations;")).trim():null;
  const paymentPresent=(await sql(databaseTarget(context,database),"select to_regclass('public.payments') is not null;")).trim()==="t";
  const payments=paymentPresent?Number((await sql(databaseTarget(context,database),"select count(*) from public.payments;")).trim()):null;
  const health = await sql(databaseTarget(context,database),`select json_build_object('database',current_database(),'orders',(select count(*) from public.orders),'users',(select count(*) from auth.users),'rls_disabled',(select count(*) from pg_tables where schemaname='public' and tablename in ('orders','payments','profiles') and not rowsecurity));`);
  const result = JSON.parse(health.trim());
  if (result.rls_disabled !== 0) throw new Error("Restored RLS health check failed");
  return {...result,migration,payments,storage_objects:storageCount};
}
export async function restoreToTemporary(context,file, {legacy = false, migrate = true,...unexpected} = {}) {
 authorizeOperation(context,"restore");

  if(Object.keys(unexpected).length)throw Error("Free target overrides refused");
  if(context.database==="postgres")context=allocateDatabase(context,"restore");
  const {container,database}=context;targetPath(context,file);
  assertTemporary(database);
  const manifest = await validateBackup(file,{container,legacy});
  await command(context,"docker",["exec",container,"createdb","-U","postgres","--template=template0",database]);
  try {
    if (manifest.format === "legacy-sql") {
      // Historical dumps include only public/auth/storage; bootstrap required Supabase prerequisites, not data.
      await sql(databaseTarget(context,database),'drop schema public; create schema if not exists extensions; create extension if not exists "uuid-ossp" with schema extensions; create extension if not exists pgcrypto with schema extensions;');
      await sql(databaseTarget(context,database),fs.readFileSync(file,"utf8"));
      return {database,legacy:true,requires_review:true,health:await inspectRestored(databaseTarget(context,database))};
    }
    await command(context,"docker",["exec","-i",container,"pg_restore","-U","supabase_admin","-d",database,"--exit-on-error","--single-transaction"],{input:fs.readFileSync(file),timeout:600000});
    const restoredVersion = (await sql(databaseTarget(context,database),"select max(version) from supabase_migrations.schema_migrations;")).trim();
    if (restoredVersion !== manifest.migration) throw new Error("Restored migration differs from manifest");
    if (migrate) await applyPending(databaseTarget(context,database));
    return {database,health:await inspectRestored(databaseTarget(context,database))};
  } catch (error) {
    throw new Error(`Candidate ${database} retained for diagnosis; development is untouched. ${error.message}`);
  }
}
export async function quarantineRecoveredPrinting(context) {
 authorizeOperation(context,"sql");const {database}=context;

  assertTemporary(database);
  if((await sql(databaseTarget(context,database),"select to_regclass('public.print_jobs') is not null;")).trim()!=="t")return 0;
  const result=await sql(databaseTarget(context,database),`begin;
    with changed as (update public.print_jobs set status='uncertain',reviewed_at=null,reviewed_by=null,review_decision=null,owner_id=null,claim_token=null,claimed_at=null,error_message='Recovery requires manual output verification' where archived_at is null and status in ('pending','processing') returning id) select count(*) from changed;
    update public.print_processor_lease set owner_id=null,expires_at='-infinity' where id;
    commit;`);
  const count=result.split(/\r?\n/).find(line=>/^\d+$/.test(line));
  return Number(count??0);
}
async function promote(context) {
  await confirmDestructive(context,"replace");
  authorizeOperation(context,"replace");
  const {container,database:candidate}=context;
  assertTemporary(candidate);
  const processes = path.join(context.root,".local-secrets","processes.json");
  const state = fs.existsSync(processes)?JSON.parse(fs.readFileSync(processes,"utf8")):{};
  if (Object.values(state).some(value=>typeof value==="number"&&isProcessRunning(value))) throw new Error("Stop app, supervisor and workers before replacement");
  if (loadEnvFile().APP_MODE !== "local") throw new Error("Local mode required");
  const confirmed = await confirmWord(`Replace local database with ${candidate}? Type RESTORE ${candidate}.`, `RESTORE ${candidate}`);
  if (!confirmed) throw new Error("Replacement cancelled; candidate retained");
  // A fresh rescue dump is mandatory immediately before cutover.
  await createBackup(context,{reason:"before-restore"});
  const quarantined=await quarantineRecoveredPrinting(databaseTarget(context,candidate));
  console.log(`Recovery print jobs held for manual verification: ${quarantined}`);
  const running = (await command(context,"docker",["ps","--format","{{.Names}}"])).trim().split(/\s+/).filter(name=>name.startsWith("supabase_")&&name.endsWith(`_${context.project}`)&&name!==container);
  for (const name of running) await command(context,"docker",["stop",name]);
  const previous = allocateDatabase(context,"previous").database;
  try {
    await sql(databaseTarget(context,"template1"),`alter database postgres allow_connections false; select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres'; alter database postgres rename to ${previous}; alter database ${candidate} rename to postgres;`);
  } catch(error) {
    const current=(await sql(databaseTarget(context,"template1"),"select exists(select 1 from pg_database where datname='postgres');")).trim();
    if(current!=="t")await sql(databaseTarget(context,"template1"),`alter database ${previous} rename to postgres; alter database postgres allow_connections true;`);
    else await sql(databaseTarget(context,"template1"),"alter database postgres allow_connections true;");
    throw new Error(`Cutover failed; original name recovered. Services remain stopped for review. ${error.message}`);
  }
  console.log(`Recovery promoted. Previous database retained as ${previous}; run local:start and verify /api/health, Auth and Storage.`);
}
export async function restoreBackup(context) {
 authorizeOperation(context,"restore");

  let file = readOption("--file");
  if (!file) {
    const available = fs.readdirSync(context.backupDirectory).filter(name=>/\.(dump|sql)$/.test(name));
    console.log(available.join("\n"));
    throw new Error("Choose a listed backup using --file backups/<name>");
  }
  file = path.resolve(context.root,file);
  targetPath(context,file);
  const manifest=await validateBackup(file,{legacy:process.argv.includes("--legacy")});
  console.log(`Verified file SHA-256: ${manifest.sha256}`);
  if (!await confirmWord(`Restore ${path.basename(file)} to a NEW isolated candidate? Type RESTORE.`,"RESTORE")) throw new Error("Restore cancelled");
  await createBackup(context,{reason:"before-restore"});
  const result = await restoreToTemporary(context,file,{legacy:process.argv.includes("--legacy")});
  console.log(JSON.stringify(result,null,2));
  if (process.argv.includes("--replace-local")) {
    if(result.legacy)throw new Error("Legacy SQL is inspection-only until migration provenance and original ACL/ownership are independently verified.");
    await promote(databaseTarget(context,result.database));
  }
  else console.log("Candidate verified. No development replacement occurred. Use the documented explicit cutover procedure only during planned recovery.");
}
if (isMain(import.meta.url)) await restoreBackup(resolveTarget());
