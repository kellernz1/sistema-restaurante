import fs from "node:fs";
import path from "node:path";

import { isProcessRunning, isWindows, LOCAL_STATE_DIR, run, runSupabase } from "./lib.mjs";
import { stopCustomerPreview } from "./stop-customer-preview.mjs";
import { stopAdminPreview } from "./stop-admin-preview.mjs";

stopAdminPreview();
stopCustomerPreview();

const stateFile = path.join(LOCAL_STATE_DIR, "processes.json");
const state = fs.existsSync(stateFile)
  ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
  : {};

for (const [name, pid] of [["supervisor",state.supervisor],["app", state.app], ["WhatsApp worker", state.worker], ["print worker", state.printWorker],["license worker",state.licenseWorker]]) {
  if (!isProcessRunning(pid)) continue;
  if (isWindows) {
    run("taskkill", ["/PID", String(pid), "/T", "/F"], { allowFailure: true });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
  }
  console.log(`Stopped ${name} (PID ${pid}).`);
}

if (fs.existsSync(stateFile)) fs.rmSync(stateFile);
runSupabase(["stop"]);
console.log("Supabase stopped. Local database data was preserved.");
