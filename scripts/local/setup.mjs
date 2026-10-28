import {directoryTarget,resolveTarget,guardEntry} from "../target-safety.mjs";


import fs from "node:fs";
import path from "node:path";

import {LOCAL_STATE_DIR,ROOT,run,SUPABASE_CLI_VERSION} from "./lib.mjs";
import {ensureDirectory} from "../target-operations.mjs";
import {runSupabase} from "../target-operations.mjs";
import { generateLocalEnv } from "./env.mjs";
import { printLocalInfo } from "./info.mjs";
import { assertInstalledSchema } from "./audit-history.mjs";
import { verifyHistory } from "../target-operations.mjs";
await guardEntry(import.meta.url,"migration");


const [nodeMajor,nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 18)) throw new Error(`Node 22.18+ or 24 LTS is required. Found ${process.versions.node}.`);

let docker;
try {
  docker = run("docker", ["info"], { capture: true, allowFailure: true });
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    throw new Error("Docker is not installed. Install Docker Desktop and run this command again.");
  }
  throw error;
}
if (docker.status !== 0) throw new Error("Docker Desktop is installed but its engine is not running.");

console.log(`Node ${process.versions.node}`);
console.log(`Supabase CLI ${SUPABASE_CLI_VERSION} (pinned by local scripts)`);
runSupabase(resolveTarget(),["--version"]);
const demo=process.argv.includes("--demo");
if(demo&&process.argv.includes("--no-demo"))throw new Error("Choose --demo or --no-demo, not both");
runSupabase(resolveTarget(),["start"],{capture:true,timeout:300000,env:{SUPABASE_DB_SEED_ENABLED:demo?"true":"false"}});

ensureDirectory(resolveTarget(),directoryTarget(resolveTarget(),LOCAL_STATE_DIR));
const markerFile = path.join(LOCAL_STATE_DIR, "setup.json");
if(process.argv.includes("--reset"))throw new Error("Setup never resets an existing database. Use the separately confirmed recovery procedure.");
const existingHistory=await verifyHistory();
if(existingHistory.registered>0&&!existingHistory.ok)throw new Error("Existing installation has pending/divergent history. Use local:update with its backup and audit guards.");
await assertInstalledSchema();
runSupabase(resolveTarget(),["migration","up","--local"],{timeout:600000});
if(!(await verifyHistory()).ok)throw new Error("Setup history does not match migration files");
fs.writeFileSync(markerFile, JSON.stringify({ databaseInitializedAt: new Date().toISOString() }, null, 2));

const ipArgumentIndex = process.argv.indexOf("--ip");
const env = generateLocalEnv({ ip: ipArgumentIndex >= 0 ? process.argv[ipArgumentIndex + 1] : undefined,demo });
if (demo) {
  run(process.execPath, [path.join(ROOT, "scripts", "seed-demo.mjs"),...process.argv.slice(2)], { env });
}

await printLocalInfo();
console.log(demo?"\nDEMONSTRATION setup complete. Credentials are available only in .env.local.":"\nEmpty development setup complete: no demo accounts or menu created. Use local:provision for a restaurant.");
