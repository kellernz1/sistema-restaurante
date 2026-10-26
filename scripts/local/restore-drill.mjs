import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createBackup } from "./backup.mjs";
import { restoreToTemporary, temporaryDatabase, assertTemporary, sql, quarantineRecoveredPrinting } from "./restore.mjs";
import { command } from "./operations-process.mjs";
import { findDbContainer, ROOT } from "./lib.mjs";

const container=findDbContainer(), directory=path.join(ROOT,"artifacts","restore-drill",new Date().toISOString().replace(/[:.]/g,"-"));
fs.mkdirSync(directory,{recursive:true});
const source=temporaryDatabase("source"), target=temporaryDatabase("restore");
const legacyTarget=temporaryDatabase("restore");
const databases=[source,target,legacyTarget];
try {
  // Read-only live snapshot. Every subsequent mutation is restricted to generated temporary names.
  const baseline=await createBackup({directory,record:false,reason:"restore-drill",container});
  await restoreToTemporary(baseline,{container,database:source,migrate:false});
  if((await sql(container,source,"select to_regclass('storage.objects') is null;")).trim()==="t") {
    await sql(container,source,"create schema if not exists storage; create table storage.objects(id uuid primary key, name text); insert into storage.objects values(gen_random_uuid(),'synthetic-storage-metadata');");
  }
  await sql(container,source,`create table public.operations_recovery_fixture(id integer primary key, note text not null); insert into public.operations_recovery_fixture values(1,'ação, niño, Gs. 25.000'),(2,'split-payment snapshot');`);
  const query=`select json_build_object('rows',(select json_agg(t order by id) from public.operations_recovery_fixture t),'orders',(select count(*) from public.orders),'payments',(select count(*) from public.payments),'auth',(select count(*) from auth.users),'storage',(select count(*) from storage.objects),'money',(select coalesce(sum(equivalent_pyg-change_pyg),0) from payments));`;
  const expected=JSON.parse((await sql(container,source,query)).trim());
  const securityQuery=`select json_build_object(
    'policies',(select json_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
    'owners',(select json_agg(json_build_array(p.oid::regprocedure::text,pg_get_userbyid(p.proowner),p.prosecdef) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
    'access',(select json_agg(json_build_array(t.tablename,r.rolname,has_table_privilege(r.rolname,format('%I.%I',t.schemaname,t.tablename),'SELECT'),has_table_privilege(r.rolname,format('%I.%I',t.schemaname,t.tablename),'INSERT'),has_table_privilege(r.rolname,format('%I.%I',t.schemaname,t.tablename),'UPDATE')) order by t.tablename,r.rolname) from pg_tables t cross join pg_roles r where t.schemaname='public' and t.tablename in ('orders','payments','profiles','print_jobs') and r.rolname in ('anon','authenticated','service_role')));`;
  const expectedSecurity=JSON.parse((await sql(container,source,securityQuery)).trim());
  const backup=await createBackup({database:source,directory,record:false,reason:"restore-drill-fixture",container});
  // Prove that neither an existing schema nor surviving target data is required.
  await command("docker",["exec",container,"createdb","-U","postgres",target]);
  await sql(container,target,"create table public.must_disappear(id int); insert into public.must_disappear values(99);");
  assertTemporary(target);await command("docker",["exec",container,"dropdb","-U","postgres",target]);
  const restored=await restoreToTemporary(backup,{container,database:target,migrate:false});
  const actual=JSON.parse((await sql(container,target,query)).trim());
  assert.deepEqual(actual,expected);
  assert.deepEqual(JSON.parse((await sql(container,target,securityQuery)).trim()),expectedSecurity);
  assert.equal((await sql(container,target,"select to_regclass('public.must_disappear') is null;")).trim(),"t");
  const legacyFile=path.join(directory,"legacy.sql");
  await command("docker",["exec",container,"pg_dump","-U","supabase_admin","-d",source,"--schema=public","--schema=auth","--schema=storage","--no-owner","--no-privileges"],{output:legacyFile});
  const legacy=await restoreToTemporary(legacyFile,{container,database:legacyTarget,legacy:true});
  assert.equal(legacy.requires_review,true);
  assert.deepEqual(JSON.parse((await sql(container,legacyTarget,query)).trim()),expected);
  const quarantined=await quarantineRecoveredPrinting(container,target);
  assert.equal((await sql(container,target,"select count(*) from public.print_jobs where archived_at is null and status in ('pending','processing');")).trim(),"0");
  fs.writeFileSync(path.join(directory,"result.json"),JSON.stringify({passed:true,health:restored.health,expected,actual,rls_owners_permissions_match:true,legacy_rows_match:true,quarantined_print_jobs:quarantined,scope:"SQL/Auth/Storage metadata; no HTTP service cutover or storage file restoration"},null,2),"utf8");
  console.log(`RESTORE DRILL PASSED: counts, Unicode data, payment totals, Auth and Storage metadata. Evidence: ${directory}`);
} finally {
  for(const database of databases){assertTemporary(database);await command("docker",["exec",container,"dropdb","-U","postgres","--if-exists",database]);}
}
