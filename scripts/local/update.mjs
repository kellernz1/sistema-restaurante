import {guardEntry,resolveTarget} from "../target-safety.mjs";

import fs from "node:fs";
import path from "node:path";
import { createBackup, validateBackup } from "../target-operations.mjs";
import {LOCAL_STATE_DIR,isProcessRunning,run,loadEnvFile} from "./lib.mjs";
import {runSupabase} from "../target-operations.mjs";
import {waitFor} from "./operations-process.mjs";
import {command} from "../target-operations.mjs";
import { verifyHistory, localMigrations } from "../target-operations.mjs";
import { assertInstalledSchema } from "./audit-history.mjs";
import {patchOperationsState} from "../target-state.mjs";
import { publicKeyConfiguration } from "../../src/features/licensing/validation.ts";
await guardEntry(import.meta.url,"migration");


const stateFile=path.join(LOCAL_STATE_DIR,"processes.json");
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,"utf8")):{};
const dryRun=process.argv.includes("--dry-run");
const keyState=publicKeyConfiguration(loadEnvFile().LICENSE_PUBLIC_KEY);
if(keyState==="invalid")throw new Error("LICENSE_PUBLIC_KEY must contain exactly 64 hexadecimal characters. No environment value was logged.");
if(keyState==="missing")console.warn("LICENSE_PUBLIC_KEY is missing or empty; first license import requires configuring the public key.");
if(!dryRun&&[state.supervisor,state.app,state.worker,state.printWorker,state.licenseWorker].some(isProcessRunning))throw new Error("Stop app, supervisor and workers before updating.");
await waitFor(()=>command(resolveTarget(),"docker",["info","--format","{{.ServerVersion}}"],{timeout:10000}),"Docker Desktop");
runSupabase(resolveTarget(),["start"],{timeout:300000,capture:true});
console.log("Supabase ready; connection secrets are not logged.");
const history=await verifyHistory();
const latest=localMigrations().filter(file=>!history.missing.some(missing=>missing.version===file.version)).at(-1)?.version??"";
if(history.orphaned.length||history.renamed.length||history.missing.some(file=>file.version<latest))throw new Error("Migration history has gaps, unknown versions or renamed files. Audit before updating.");
await assertInstalledSchema();
if(dryRun){
  runSupabase(resolveTarget(),["db","push","--local","--dry-run","--skip-vault"],{timeout:120000});
  console.log("DRY RUN complete: no backup, project migration or build was executed.");
  process.exit(0);
}
const backup=await createBackup(resolveTarget(),{reason:"before-update"});
await validateBackup(backup);
// Backup errors abort before any migration. Never reset the local database.
runSupabase(resolveTarget(),["migration","up","--local"],{timeout:600000});
if(!(await verifyHistory()).ok)throw new Error("Post-update migration history does not match files");
patchOperationsState(resolveTarget(),{migration_warning:false});
run(process.execPath,["scripts/next-command.mjs","build"],{env:loadEnvFile()});
console.log("Update complete. Run local:start. Restore the rescue backup through local:restore if recovery is needed.");
