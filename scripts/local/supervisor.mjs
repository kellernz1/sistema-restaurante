import { guardEntry, resolveTarget, requireAutomation } from "../target-safety.mjs";
import path from "node:path";
import { spawn } from "../target-process.mjs";
import { ROOT, LOCAL_STATE_DIR, loadEnvFile, findDbContainer } from "./lib.mjs";
import { operationsDirectory, readOperationsPolicy, readOperationsState } from "../../src/lib/operations.ts";
import { command, writeOperationalJson, patchOperationalState, createOperationalLogger, stopOwnedProcesses, claimSupervisorLock, releaseSupervisorLock, removeOperationalFile } from "../target-operations.mjs";
import { RestartBudget, backupReason } from "./restart-budget.mjs";
import { SupervisorState, createSupervisorReporter } from "./supervisor-state.mjs";
await guardEntry(import.meta.url, "runtime");
const target = resolveTarget(), env = loadEnvFile();
const stateFile = path.join(LOCAL_STATE_DIR, "processes.json"), lockFile = path.join(operationsDirectory, "supervisor.lock");
await claimSupervisorLock(target, lockFile);
const report = createSupervisorReporter(), budget = new RestartBudget();
const children = new Map(), failures = new Set(), log = createOperationalLogger(target);
process.stderr.on("error", () => failures.add("stderr"));
let stopping = false, shuttingDown = false, backup = null, lastBackupAttempt = 0, lastProbe = 0, ticking = false, pendingBackupState = false;
const definitions = {
  app: ["scripts/next-command.mjs", "start", "-H", "0.0.0.0"], worker: ["scripts/whatsapp-worker.mjs"],
  printWorker: ["scripts/print-worker.mjs"], licenseWorker: ["scripts/license-worker.mjs"],
};
const state = new SupervisorState({
  write: (file, value) => writeOperationalJson(target, file, value), stateFile,
  heartbeatFile: path.join(operationsDirectory, "supervisor.json"), failures, restarts: budget.attempts, report,
  processes: () => Object.fromEntries([...children].filter(([, child]) => child.pid).map(([key, child]) => [key, child.pid]).concat(backup?.pid ? [["backup", backup.pid]] : [])),
});
function safeLog(name, bytes) {
  void log(name, bytes.toString("utf8").slice(0, 65536)).then(() => failures.delete(`log:${name}`), error => { failures.add(`log:${name}`); report(error, `log:${name}`); });
}
function start(name) {
  if (stopping || children.has(name)) return;
  const delay = budget.take(name);
  if (delay === null) { failures.add(name); return; }
  try {
    const child = spawn(process.execPath, definitions[name], { cwd: ROOT, env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    children.set(name, child);
    child.stdout.on("data", bytes => safeLog(name, bytes)); child.stderr.on("data", bytes => safeLog(`${name}.error`, bytes));
    child.on("error", error => { failures.add(name); report(error, name); });
    child.on("spawn", () => failures.delete(name));
    child.on("close", () => {
      children.delete(name); safeLog("supervisor", `${name} exited; attempt ${budget.attempts[name]}/5`);
      if (!stopping) { void state.publish(); setTimeout(() => start(name), delay); }
    });
    void state.publish();
  } catch (error) { failures.add(name); report(error, name); if (!stopping) setTimeout(() => start(name), delay); }
}
function runBackup(reason) {
  if (backup || stopping) return;
  lastBackupAttempt = Date.now(); requireAutomation(target, "backup");
  backup = spawn(process.execPath, ["scripts/local/backup.mjs"], { cwd: ROOT, env: { ...process.env, ...env, BACKUP_REASON: reason }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  void state.publish();
  backup.stdout.on("data", bytes => safeLog("backup", bytes)); backup.stderr.on("data", bytes => safeLog("backup.error", bytes));
  const deadline = setTimeout(() => { if (backup) void stopOwnedProcesses(target, [backup.pid]).then(results => { if (results.some(value => !value.stopped)) failures.add("backup-stop"); }, error => report(error, "backup-stop")); }, 900000);
  backup.on("error", error => { failures.add("backup"); report(error, "backup"); });
  backup.on("close", code => {
    clearTimeout(deadline); backup = null;
    if (code !== 0) {
      failures.add("backup");
      pendingBackupState = true;
    } else failures.delete("backup");
    if (!stopping) void state.publish();
  });
}
async function tick() {
  if (ticking) return;
  if (stopping) { if (!shuttingDown) await state.publish(true); return; }
  ticking = true;
  try {
    if (pendingBackupState) {
      try { await patchOperationalState(target, { result: "failed" }); pendingBackupState = false; failures.delete("state-write:backup"); }
      catch (error) { failures.add("state-write:backup"); report(error, "state-write:backup"); }
    }
    const policy = readOperationsPolicy(), current = readOperationsState();
    if (current.result === "valid") failures.delete("backup");
    const due = backupReason(current, policy, lastBackupAttempt, null); if (due) runBackup(due);
    if (Date.now() - lastProbe > 30000) {
      lastProbe = Date.now();
      const response = await fetch(new URL("/api/health", env.NEXT_PUBLIC_APP_URL), { signal: AbortSignal.timeout(8000) });
      if (response.ok) failures.delete("app-health"); else failures.add("app-health");
      if (policy.after_cash_close) {
        const latest = (await command(target, "docker", ["exec", findDbContainer(), "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atc", "select max(created_at) from public.cash_session_events where action='close'"], { timeout: 10000 })).trim();
        const closeDue = backupReason(current, policy, lastBackupAttempt, latest); if (closeDue) runBackup(closeDue);
      }
    }
    failures.delete("operations-probe");
  } catch (error) { failures.add("operations-probe"); report(error, "operations-probe"); }
  finally { if (!stopping) await state.publish(true); ticking = false; }
}
async function shutdown() {
  if (shuttingDown) return; stopping = true; shuttingDown = true;
  try {
    await state.pending;
    const results = await stopOwnedProcesses(target, [...children.values()].map(child => child.pid).concat(backup?.pid ?? []));
    if (results.some(value => !value.stopped)) {
      failures.add("shutdown-denied"); await state.publish(true);
      report(Object.assign(Error("Owned children remain alive; state and lock retained"), { code: "ESTOP" }), "shutdown");
      return;
    }
    await removeOperationalFile(target, stateFile); await releaseSupervisorLock(target, lockFile, process.pid);
    clearInterval(timer); process.exit(0);
  } catch (error) { failures.add("shutdown-failed"); report(error, "shutdown"); }
  finally { shuttingDown = false; }
}
for (const name of Object.keys(definitions)) start(name);
await state.publish(true);
const timer = setInterval(() => { void tick().catch(error => report(error, "tick")); }, 5000);
process.on("SIGTERM", () => { void shutdown().catch(error => report(error, "shutdown")); });
process.on("SIGINT", () => { void shutdown().catch(error => report(error, "shutdown")); });
