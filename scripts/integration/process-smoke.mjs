import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { integrationContext } from "./context.mjs";
import { observeProcesses } from "./process-observation.mjs";
import { resolveTarget, targetPath } from "../target-safety.mjs";
import { databaseSql } from "../target-operations.mjs";
import { atomicJson } from "../target-state.mjs";
import { isProcessRunning } from "../local/lib.mjs";

// Never use an existing installation, even with maintenance authorization flags.
integrationContext();
const target = resolveTarget();
assert.equal(target.profile, "disposable", "Process smoke requires a disposable target");
const supervisorPid = Number(process.env.PROCESS_SMOKE_SUPERVISOR_PID);
assert.ok(Number.isSafeInteger(supervisorPid) && supervisorPid > 0, "Missing owned supervisor PID");
const names = ["app", "worker", "printWorker", "licenseWorker"];
const stateFile = targetPath(target, path.join(target.root, ".local-secrets", "processes.json"));
const heartbeatFile = targetPath(target, path.join(target.root, ".local-secrets", "operations", "supervisor.json"));
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const logContains = (name, text) => {
  const file = targetPath(target, path.join(target.root, "logs", name));
  return fs.existsSync(file) && fs.readFileSync(file, "utf8").includes(text);
};
const printHeartbeat = async () => (await databaseSql(target,
  "select coalesce(max(last_seen_at)::text,'') from public.print_worker_heartbeats where driver='file';")).trim();
let initial;

function checkAlive() {
  assert.ok(isProcessRunning(supervisorPid), "Supervisor exited during process acceptance");
  if (!fs.existsSync(stateFile)) return false;
  const state = read(stateFile);
  assert.equal(state.supervisor, supervisorPid, "Unexpected supervisor identity");
  for (const name of names) {
    if (!Number.isSafeInteger(state[name]) || state[name] <= 0) {
      assert.ok(!initial, `${name} disappeared during process acceptance`);
      return false;
    }
    assert.ok(isProcessRunning(state[name]), `${name} exited during process acceptance`);
    if (initial) assert.equal(state[name], initial[name], `${name} restarted during process acceptance`);
  }
  assert.equal(new Set([supervisorPid, ...names.map(name => state[name])]).size, 5, "Process identities must be distinct");
  initial ??= state;
  return true;
}

let ready = false;
let firstPrintHeartbeat;
let activity = {};
// WhatsApp may initially race the app startup, then use its existing 60-second retry.
const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  if (checkAlive() && fs.existsSync(heartbeatFile)) {
    firstPrintHeartbeat = await printHeartbeat();
    const response = await fetch(new URL("/api/health", target.appUrl), { signal: AbortSignal.timeout(3000) }).catch(() => null);
    activity = {
      app: !!response?.ok,
      printing: !!firstPrintHeartbeat,
      whatsapp: logContains("worker.log", "WhatsApp queue processed:"),
      licensing: logContains("licenseWorker.log", "License worker active."),
    };
    if (Object.values(activity).every(Boolean)) {
      ready = true;
      break;
    }
  }
  await delay(250);
}
assert.ok(ready, `Processes did not produce successful activity within 90 seconds: ${JSON.stringify(activity)}`);
const firstSupervisorHeartbeat = read(heartbeatFile).heartbeat;
const observation = await observeProcesses({
  check: () => assert.ok(checkAlive(), "Process state disappeared during observation"),
  durationMs: 11000,
});
const heartbeat = read(heartbeatFile);
assert.ok(Date.parse(heartbeat.heartbeat) > Date.parse(firstSupervisorHeartbeat), "Supervisor heartbeat did not advance");
assert.deepEqual(heartbeat.failures, [], "Supervisor reported a startup/probe failure");
for (const name of names) assert.equal(heartbeat.restarts[name], 1, `${name} required a restart`);
assert.ok(Date.parse(await printHeartbeat()) > Date.parse(firstPrintHeartbeat), "File-print heartbeat did not advance");
const evidence = {
  passed: true,
  ...observation,
  processes: ["supervisor", ...names],
  stable_pids: true,
  supervisor_heartbeat_advanced: true,
  print_heartbeat_advanced: true,
  whatsapp_success_log: true,
  license_success_log: true,
  app_health: true,
};
atomicJson(target, path.join(path.dirname(process.env.TARGET_CONTEXT_FILE), "process-smoke.json"), evidence);
console.log(JSON.stringify(evidence));
