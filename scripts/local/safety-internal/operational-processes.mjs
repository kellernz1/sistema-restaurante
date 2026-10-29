import { setTimeout as wait } from "node:timers/promises";
import { authorizeOperation } from "../../target-safety.mjs";
import { command } from "../operations-process.mjs";
import { isProcessRunning } from "../lib.mjs";
import { confirmProcessExit } from "../supervisor-state.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { targetPath } from "../../target-safety.mjs";
import { retryOperationalFile, removeOperationalFile } from "./operational-files.mjs";

export async function claimSupervisorLock(context, file) {
  authorizeOperation(context, "runtime"); file = targetPath(context, file);
  await retryOperationalFile(context, file, () => fs.mkdir(path.dirname(file), { recursive: true }));
  const owner = await fs.readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (owner !== null) {
    if (isProcessRunning(Number(owner))) throw Error("Supervisor already running");
    await removeOperationalFile(context, file);
  }
  await retryOperationalFile(context, file, () => fs.writeFile(file, String(process.pid), { flag: "wx", mode: 0o600 }));
}

export async function releaseSupervisorLock(context, file, pid) {
  authorizeOperation(context, "runtime"); file = targetPath(context, file);
  const owner = await fs.readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (owner !== null && Number(owner) !== pid) throw Error("Supervisor lock belongs to another process; evidence retained");
  await removeOperationalFile(context, file);
}

export async function stopOwnedProcesses(context, pids, { timeout = 5000 } = {}) {
  authorizeOperation(context, "runtime");
  const results = [];
  for (const pid of [...new Set(pids)].filter(Number.isSafeInteger)) {
    results.push(await confirmProcessExit(pid, {
      alive: isProcessRunning, wait, timeout,
      signal: async value => {
        authorizeOperation(context, "runtime");
        if (process.platform === "win32") await command(context, "taskkill", ["/PID", String(value), "/T", "/F"], { timeout });
        else process.kill(value, "SIGTERM");
      },
    }));
  }
  return results;
}
