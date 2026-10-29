import { guardEntry, resolveTarget } from "../target-safety.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_STATE_DIR } from "./lib.mjs";
import { runSupabase, stopOwnedProcesses, removeOperationalFile, releaseSupervisorLock } from "../target-operations.mjs";
import { stopCustomerPreview } from "./stop-customer-preview.mjs";
import { stopAdminPreview } from "./stop-admin-preview.mjs";
import { stopRuntimeEvidence } from "./supervisor-state.mjs";
await guardEntry(import.meta.url, "runtime");
const target = resolveTarget();
stopAdminPreview(); stopCustomerPreview();
const stateFile = path.join(LOCAL_STATE_DIR, "processes.json");
const read = async file => fs.readFile(file, "utf8").then(JSON.parse, error => { if (error.code === "ENOENT") return {}; throw error; });
const heartbeat = await read(path.join(LOCAL_STATE_DIR, "operations/supervisor.json"));
const recorded = await read(stateFile);
const lockFile = path.join(LOCAL_STATE_DIR, "operations/supervisor.lock");
const owner = await fs.readFile(lockFile, "utf8").then(Number, error => { if (error.code === "ENOENT") return undefined; throw error; });
if (owner && recorded.supervisor && owner !== recorded.supervisor && owner !== heartbeat.supervisor) throw Error("Process evidence disagrees with the supervisor lock; stop refused");
const state = { ...recorded, ...(heartbeat.supervisor === owner ? heartbeat.processes : {}), supervisor: owner ?? recorded.supervisor };
// Do not stop children underneath a supervisor that may immediately restart them.
await stopRuntimeEvidence(state, {
  stop: pids => stopOwnedProcesses(target, pids),
  release: () => releaseSupervisorLock(target, lockFile, state.supervisor),
  remove: () => removeOperationalFile(target, stateFile),
});
runSupabase(target, ["stop"]);
console.log("Confirmed local process exit. Supabase stopped; database data preserved.");
