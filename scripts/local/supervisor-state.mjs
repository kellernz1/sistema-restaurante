// No transports here: callers supply installation-bound operations.
export class SupervisorState {
  constructor({ write, stateFile, heartbeatFile, processes, failures, restarts, report, pid = process.pid, now = () => new Date().toISOString() }) {
    Object.assign(this, { write, stateFile, heartbeatFile, processes, failures, restarts, report, pid, now });
    this.startedAt = now(); this.signature = null; this.pending = Promise.resolve();
  }
  publish(heartbeat = false) {
    const task = this.pending.then(async () => {
      const processes = this.processes(), signature = JSON.stringify(processes);
      if (signature !== this.signature) {
        try {
          await this.write(this.stateFile, { ...processes, supervisor: this.pid, startedAt: this.startedAt });
          this.signature = signature; this.failures.delete("state-write:processes");
        } catch (error) { this.failures.add("state-write:processes"); this.report(error, "state-write:processes"); }
      }
      if (heartbeat) {
        const failures = [...this.failures].filter(value => value !== "state-write:heartbeat");
        try {
          await this.write(this.heartbeatFile, { supervisor: this.pid, heartbeat: this.now(), mode: failures.length ? "degraded" : "normal", failures, processes, restarts: this.restarts });
          this.failures.delete("state-write:heartbeat");
        } catch (error) { this.failures.add("state-write:heartbeat"); this.report(error, "state-write:heartbeat"); }
      }
    });
    // Reporting must never turn an event callback into an unhandled rejection.
    this.pending = task.catch(error => { this.failures.add("state-write:unexpected"); this.report(error, "state-write:unexpected"); });
    return this.pending;
  }
}

export function createSupervisorReporter(write = text => process.stderr.write(text)) {
  const seen = new Set(); let remaining = 256;
  return (error, scope) => {
    const key = `${scope}:${error.code ?? error.name}:${error.syscall ?? ""}`;
    if (seen.has(key) || remaining <= 0) return;
    seen.add(key); remaining--;
    // Filesystem errors contain paths, not file contents, environment or payloads.
    const detail = error.syscall ? error.stack ?? error.message : `${error.name}: ${error.code ?? "operation failed"}`;
    try { write(`[supervisor:${scope}] ${String(detail).slice(0, 4096)}\n`); } catch { /* The stderr sink may also be unavailable. */ }
    if (error.cleanupError) {
      try { write(`[supervisor:${scope}:cleanup] ${error.cleanupError.code ?? "cleanup failed"}\n`); } catch { /* Keep the original error. */ }
    }
  };
}

export async function confirmProcessExit(pid, { alive, signal, wait, timeout = 5000, now = Date.now }) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { pid, stopped: true, alreadyExited: true };
  if (!alive(pid)) return { pid, stopped: true, alreadyExited: true };
  let error;
  try { await signal(pid); } catch (failure) { error = failure; }
  const deadline = now() + timeout;
  while (alive(pid) && now() < deadline) await wait(Math.min(50, Math.max(1, deadline - now())));
  return { pid, stopped: !alive(pid), error };
}

export async function stopRuntimeEvidence(state, { stop, release, remove }) {
  if ((await stop([state.supervisor])).some(value => !value.stopped)) throw Error("Supervisor is still running; process state and lock retained");
  if ((await stop([state.app, state.worker, state.printWorker, state.licenseWorker, state.backup])).some(value => !value.stopped)) throw Error("Owned children are still running; process state and lock retained");
  await release(); await remove();
}
