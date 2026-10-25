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

if (isProcessRunning(previous.app) || isProcessRunning(previous.worker) || isProcessRunning(previous.printWorker)) {
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
fs.writeFileSync(stateFile, JSON.stringify({ app, startedAt: new Date().toISOString() }, null, 2));

let healthy = false;
for (let attempt = 0; attempt < 45; attempt += 1) {
  if (!isProcessRunning(app)) throw new Error("The application stopped during startup. Check logs/app.error.log.");
  try {
    const response = await fetch(new URL("/api/health", env.NEXT_PUBLIC_APP_URL), {
      signal: AbortSignal.timeout(2_000),
      cache: "no-store",
    });
    if (response.ok) {
      healthy = true;
      break;
    }
  } catch {
    // The production server may still be binding its port.
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (!healthy) {
  throw new Error("The local stack did not become healthy within 45 seconds. Check logs/app.error.log and run `npm run local:stop`.");
}

const worker = startDetached(
  [path.join(ROOT, "scripts", "whatsapp-worker.mjs")],
  "whatsapp-worker",
  env,
);
const printWorker = startDetached([path.join(ROOT,"scripts","print-worker.mjs")],"print-worker",env);
fs.writeFileSync(stateFile, JSON.stringify({ app, worker, printWorker, startedAt: new Date().toISOString() }, null, 2));

console.log(`Local app started (PID ${app}).`);
console.log(`WhatsApp worker started (PID ${worker}).`);
console.log(`Print worker started (PID ${printWorker}).`);
console.log(`Open ${env.NEXT_PUBLIC_APP_URL}`);
console.log("Logs are stored in logs/. Run `npm run local:stop` for a clean shutdown.");
