import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { findDbContainer, ROOT, run } from "./lib.mjs";
import { createBackup } from "./backup.mjs";
import { restoreToTemporary, assertTemporary, temporaryDatabase } from "./restore.mjs";
import { createIsolatedDatabase, dropIsolatedDatabase, databaseSql } from "./isolated-database.mjs";
import { migrateIsolated, localMigrations, verifyHistory } from "./migration-history.mjs";
import { assertInstalledSchema } from "./audit-history.mjs";
import assert from "node:assert/strict";
import {seedTestLicense}from "../../tests/helpers/license-fixture.mjs";

const database=`mesa_clean_${randomBytes(12).toString("hex")}`,container=findDbContainer(),recovery=temporaryDatabase("restore");
try {
  await createIsolatedDatabase(container,database);
  console.log(`Created isolated database ${database}; development is untouched.`);
  const files=localMigrations();
  migrateIsolated(database,{through:files.at(-2).version});
  const upgradeBackup=await createBackup({database,directory:path.join(ROOT,"artifacts","clean-recovery"),record:false,reason:"older-migration-recovery",container});
  migrateIsolated(database);
  if(!(await verifyHistory(database,container)).ok)throw new Error("Official clean history mismatch");
  const upgraded=await restoreToTemporary(upgradeBackup,{container,database:recovery});
  if(upgraded.health.migration!==files.at(-1).version)throw new Error("Older-backup migration upgrade failed");
  console.log("Official CLI applied/tracked all migrations; older-backup upgrade passed in isolated candidate.");
  await databaseSql(container,database,"set role postgres; insert into auth.users(id,email,raw_user_meta_data) select gen_random_uuid(),email,jsonb_build_object('full_name','Clean test') from (values('admin@restaurante.local'),('caixa@restaurante.local'),('cozinha@restaurante.local'),('garcom@restaurante.local'),('garcom2@restaurante.local')) v(email);");
  await databaseSql(container,database,"set role postgres;\n"+fs.readFileSync(path.join(ROOT,"supabase/seed.sql"),"utf8"));
  await seedTestLicense(container,database);
  const result=run(process.execPath,["scripts/local/sql-tests.mjs"],{capture:true,allowFailure:true,env:{SQL_TEST_DATABASE:database}});
  if(result.status!==0)throw new Error(result.stdout.slice(-3000)+"\n"+result.stderr);
  // A synthetic, non-migration DDL probe exists only in this disposable database.
  await databaseSql(container,database,"alter table public.orders add column untracked_history_guard_probe integer;");
  assert.equal((await verifyHistory(database,container)).ok,true);
  await assert.rejects(()=>assertInstalledSchema(database,container),/schema differs/);
  console.log("PASS: untracked DDL is refused even when version lists match.");
  console.log(`CLEAN VALIDATION PASSED: ${files.length} officially tracked migrations, seed and all SQL suites/concurrency tests.`);
} finally {
  await dropIsolatedDatabase(container,database);
  assertTemporary(recovery);run("docker",["exec",container,"dropdb","-U","postgres","--if-exists",recovery],{capture:true});
  console.log("Removed isolated databases. Development was not reset or migrated.");
}
