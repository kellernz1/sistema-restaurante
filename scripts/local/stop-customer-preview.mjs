import {assertOwnedModule,resolveTarget,guardEntry,authorizeOperation} from "../target-safety.mjs";

import fs from "node:fs";
import path from "node:path";
import { isMain, isProcessRunning, isWindows, LOCAL_STATE_DIR, run } from "./lib.mjs";
await guardEntry(import.meta.url,"runtime");


export function stopCustomerPreview() {
 assertOwnedModule(resolveTarget(),import.meta.url);
 authorizeOperation(resolveTarget(),"runtime");
  const file = path.join(LOCAL_STATE_DIR, "customer-preview.json");
  if (!fs.existsSync(file)) return;
  const state = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  for (const key of ["tunnel", "gateway", "apiHelper", "dnsHelper"]) {
    const pid = state[key];
    if (!isProcessRunning(pid)) continue;
    if (isWindows) run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    else process.kill(pid, "SIGTERM");
  }
  fs.rmSync(file);
  console.log("Temporary customer preview stopped. The public link is no longer available.");
}

if (isMain(import.meta.url)) stopCustomerPreview();
