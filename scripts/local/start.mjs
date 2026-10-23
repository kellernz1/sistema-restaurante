import fs from "node:fs";
import path from "node:path";

import {
  ensureDirectory,
  isProcessRunning,
  loadEnvFile,
  LOCAL_STATE_DIR,
  ROOT,
  run,
  runSupabase,
  startDetached,
} from "./lib.mjs";
import { generateLocalEnv } from "./env.mjs";

runSupabase(["start"]);
const env = fs.existsSync(path.join(ROOT, ".env.local"))
  ? loadEnvFile()
  : generateLocalEnv();

ensureDirectory(LOCAL_STATE_DIR);
const stateFile = path.join(LOCAL_STATE_DIR, "processes.json");
const previous = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
  : {};

if (isProcessRunning(previous.app) || isProcessRunning(previous.worker)) {
  throw new Error("The local app or worker is already running. Use `npm run local:stop` first.");
}

if (!process.argv.includes("--skip-build")) {
  run(process.execPath, [path.join(ROOT, "scripts", "next-command.mjs"), "build"], { env });
}

const app = startDetached(
  [path.join(ROOT, "scripts", "next-command.mjs"), "start", "-H", "0.0.0.0"],
  "app",
  env,
);
const worker = startDetached(
  [path.join(ROOT, "scripts", "whatsapp-worker.mjs")],
  "whatsapp-worker",
  env,
);
fs.writeFileSync(stateFile, JSON.stringify({ app, worker, startedAt: new Date().toISOString() }, null, 2));

console.log(`Local app started (PID ${app}).`);
console.log(`WhatsApp worker started (PID ${worker}).`);
console.log(`Open ${env.NEXT_PUBLIC_APP_URL}`);
console.log("Logs are stored in logs/. Run `npm run local:stop` for a clean shutdown.");
