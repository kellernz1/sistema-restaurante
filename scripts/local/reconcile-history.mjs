import {directoryTarget,guardEntry,resolveTarget,databaseTarget} from "../target-safety.mjs";


import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {ROOT,LOCAL_STATE_DIR,findDbContainer,isProcessRunning,readOption} from "./lib.mjs";
import {runSupabase} from "../target-operations.mjs";
import { snapshot, schemaDifferences, configuration, normalizeConfiguration, dataFingerprint } from "./audit-history.mjs";
import { createBackup, validateBackup, copyExternal } from "../target-operations.mjs";
import { verifyHistory } from "../target-operations.mjs";
import { databaseSql } from "../target-operations.mjs";
import {patchOperationalState} from "../target-operations.mjs";
await guardEntry(import.meta.url,"repair");


const requested=readOption("--report");if(!requested)throw new Error("Use --report artifacts/migration-history/<audit>/report.json");
const directory=path.dirname(path.resolve(ROOT,requested)),report=JSON.parse(fs.readFileSync(path.join(directory,"report.json"),"utf8"));
const root=path.join(ROOT,"artifacts","migration-history");if(!directory.startsWith(root+path.sep))throw new Error("Audit must be inside migration-history artifacts");
if(!report.identical_schema||report.differences.length||report.history.orphaned.length||report.history.renamed.length)throw new Error("Only an identical, unambiguous schema can be reconciled");
const processes=path.join(LOCAL_STATE_DIR,"processes.json");
const state=fs.existsSync(processes)?JSON.parse(fs.readFileSync(processes,"utf8")):{};
if([state.supervisor,state.app,state.worker,state.printWorker,state.licenseWorker].some(isProcessRunning))throw new Error("App/supervisor/workers must remain stopped");
for(const file of report.files){if(path.basename(file.file)!==file.file)throw new Error("Unsafe migration filename");const digest=createHash("sha256").update(fs.readFileSync(path.join(ROOT,"supabase/migrations",file.file))).digest("hex");assert.equal(digest,file.sha256,"Migration changed after audit");}
const container=findDbContainer(),clean=JSON.parse(fs.readFileSync(path.join(directory,"clean.json"),"utf8"));
assert.deepEqual(schemaDifferences(clean,await snapshot(container,"postgres")),[],"Development schema changed after audit");
const config=normalizeConfiguration(await configuration(container,"postgres")),reference=normalizeConfiguration(report.configurations.clean);
for(const table of Object.keys(reference)) {
  if(table==="restaurant_settings") {assert.equal(config[table].length,1);assert.equal(config[table][0].id,true);}
  else assert.deepEqual(config[table],reference[table],`Migration-created configuration differs: ${table}`);
}
const beforeHistory=await verifyHistory();
assert.deepEqual(beforeHistory,report.history,"History changed after audit");
const beforeData=await dataFingerprint(container,"postgres");
const oldRows=JSON.parse((await databaseSql(databaseTarget(resolveTarget(),"postgres"),"select json_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t;")).trim());
const backup=await createBackup(resolveTarget(),{reason:"before-history-reconciliation"});
const manifest=await validateBackup(backup);
assert.equal(manifest.result,"valid");
const safetyDirectory=path.join(directory,"safety-backup");fs.mkdirSync(safetyDirectory,{recursive:true});
await copyExternal(resolveTarget(),backup,directoryTarget(resolveTarget(),safetyDirectory,{external:true}));
const safetyCopy=path.join(safetyDirectory,path.basename(backup));await validateBackup(safetyCopy);
fs.writeFileSync(path.join(directory,"before-repair.json"),JSON.stringify({backup,safety_copy:safetyCopy,manifest,beforeData,beforeHistory},null,2),"utf8");
assert.deepEqual(schemaDifferences(clean,await snapshot(container,"postgres")),[],"Schema changed while backing up");
const versions=beforeHistory.missing.map(row=>row.version);
if(versions.some(version=>!/^\d+$/.test(version)))throw new Error("Invalid repair version");
if(versions.length){
 const result=runSupabase(resolveTarget(),["migration","repair","--local","--status","applied",...versions],{capture:true,allowFailure:true,timeout:120000});
 if(result.status!==0)throw new Error(`Official metadata repair failed: ${result.stderr.slice(-3000)}`);
 fs.writeFileSync(path.join(directory,"official-repair.log"),result.stdout+result.stderr,"utf8");
}
const afterHistory=await verifyHistory(),afterData=await dataFingerprint(container,"postgres");
assert.equal(afterHistory.ok,true);assert.deepEqual(afterData,beforeData,"Public business data changed");
assert.deepEqual(schemaDifferences(clean,await snapshot(container,"postgres")),[],"Schema changed during repair");
const allRows=JSON.parse((await databaseSql(databaseTarget(resolveTarget(),"postgres"),"select json_agg(to_jsonb(t) order by version) from supabase_migrations.schema_migrations t;")).trim());
assert.deepEqual(allRows.filter(row=>oldRows.some(old=>old.version===row.version)),oldRows,"Previously recorded metadata changed");
await patchOperationalState(resolveTarget(),{migration_warning:false});
const postBackup=await createBackup(resolveTarget(),{reason:"after-history-reconciliation"});await validateBackup(postBackup);
fs.writeFileSync(path.join(directory,"reconciled.json"),JSON.stringify({backup:safetyCopy,post_backup:postBackup,registered:versions,afterHistory,public_data_unchanged:true,schema_unchanged:true,old_history_unchanged:true},null,2),"utf8");
console.log(`Reconciled ${versions.length} history entries only; schema/public data unchanged. Backup verified: ${path.basename(backup)}`);
