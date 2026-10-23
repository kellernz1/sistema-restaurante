import fs from "node:fs";
import path from "node:path";

import {
  ensureDirectory,
  LOCAL_STATE_DIR,
  ROOT,
  run,
  runSupabase,
  SUPABASE_CLI_VERSION,
} from "./lib.mjs";
import { generateLocalEnv } from "./env.mjs";
import { printLocalInfo } from "./info.mjs";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) throw new Error(`Node 20 or newer is required. Found ${process.versions.node}.`);

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
runSupabase(["--version"]);
runSupabase(["start"]);

ensureDirectory(LOCAL_STATE_DIR);
const markerFile = path.join(LOCAL_STATE_DIR, "setup.json");
const firstSetup = !fs.existsSync(markerFile) || process.argv.includes("--reset");
if (firstSetup) {
  runSupabase(["db", "reset", "--local"]);
  fs.writeFileSync(markerFile, JSON.stringify({ databaseInitializedAt: new Date().toISOString() }, null, 2));
} else {
  console.log("Database was already initialized; skipping destructive reset.");
}

const ipArgumentIndex = process.argv.indexOf("--ip");
const env = generateLocalEnv({ ip: ipArgumentIndex >= 0 ? process.argv[ipArgumentIndex + 1] : undefined });
const noDemo = process.argv.includes("--no-demo");
if (noDemo) {
  run(process.execPath, [path.join(ROOT, "scripts", "seed-demo.mjs"), "--staff-only"], { env });
} else {
  run(process.execPath, [path.join(ROOT, "scripts", "seed-demo.mjs")], { env });
}

await printLocalInfo();
console.log("\nSetup complete. Run `npm run local:start` to start the production app and worker.");
