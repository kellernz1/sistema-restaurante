import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { authorizeOperation, targetPath } from "../../target-safety.mjs";

export const fileRetryDelays = Object.freeze([25, 50, 100, 200, 400]);
const publications = new Map();

function checked(context, file, purpose = "runtime") {
  authorizeOperation(context, context.profile === "disposable" ? "file" : purpose);
  return targetPath(context, file);
}

// Each attempted operation rechecks the original capability, including after waits.
export async function retryOperationalFile(context, file, operation, { platform = process.platform, wait = delay, purpose = "runtime" } = {}) {
  for (let attempt = 0; ; attempt++) {
    checked(context, file, purpose);
    try { return await operation(); }
    catch (error) {
      if (platform !== "win32" || !["EPERM", "EBUSY"].includes(error.code) || attempt === fileRetryDelays.length) throw error;
      await wait(fileRetryDelays[attempt]);
    }
  }
}

export function serializeOperationalFile(context, file, operation, { purpose = "runtime" } = {}) {
  file = checked(context, file, purpose);
  const previous = publications.get(file) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => { checked(context, file, purpose); return operation(); });
  publications.set(file, next);
  void next.finally(() => { if (publications.get(file) === next) publications.delete(file); }).catch(() => {});
  return next;
}

// Separate async API: the shared synchronous atomicJson contract is unchanged.
export async function writeOperationalJson(context, file, value, options = {}) {
  const snapshot = JSON.stringify(value, null, 2);
  return publish(context, file, () => snapshot, options);
}

export async function patchOperationalState(context, update, options = {}) {
  const file = path.join(context.root, ".local-secrets/operations/state.json");
  return publish(context, file, async () => {
    const current = await (options.io ?? fs).readFile(file, "utf8").then(JSON.parse, error => { if (error.code === "ENOENT") return {}; throw error; });
    delete current.supervisor;
    return JSON.stringify({ ...current, ...update }, null, 2);
  }, options);
}

function publish(context, file, value, options) {
  return serializeOperationalFile(context, file, async () => {
    const io = options.io ?? fs, temporary = `${file}.${randomUUID()}.tmp`;
    let primary, created = false;
    try {
      const snapshot = await value();
      await retryOperationalFile(context, file, () => io.mkdir(path.dirname(file), { recursive: true }), options);
      checked(context, temporary, options.purpose);
      const handle = await retryOperationalFile(context, temporary, () => io.open(temporary, "wx", 0o600), options); created = true;
      let writeError;
      try { await handle.writeFile(snapshot, "utf8"); }
      catch (error) { writeError = error; throw error; }
      finally {
        try { await handle.close(); }
        catch (error) { if (writeError) Object.defineProperty(writeError, "closeError", { value: error }); else throw error; }
      }
      await retryOperationalFile(context, file, () => io.rename(temporary, file), options);
    } catch (error) { primary = error; throw error; }
    finally {
      if (created) {
        try { await retryOperationalFile(context, temporary, () => io.rm(temporary, { force: true }), options); }
        catch (cleanupError) {
          if (primary) Object.defineProperty(primary, "cleanupError", { value: cleanupError, configurable: true });
          else throw cleanupError;
        }
      }
    }
  }, options);
}

export async function removeOperationalFile(context, file, options = {}) {
  return serializeOperationalFile(context, file, () => retryOperationalFile(context, file, () => (options.io ?? fs).rm(file, { force: true }), options), options);
}

export function createOperationalLogger(context, { maximum = 5 * 1024 * 1024, copies = 3, maximumPending = 256 * 1024, io = fs, ...retry } = {}) {
  const pending = new Map(), rotations = new Map();
  return async function log(name, text) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw Error("Invalid log name");
    const file = checked(context, path.join(context.root, "logs", `${name}.log`));
    const record = Buffer.from(`${new Date().toISOString()} ${text}\n`, "utf8").subarray(0, Math.min(65536, maximum));
    const bytes = (pending.get(file) ?? 0) + record.length;
    if (bytes > maximumPending) throw Object.assign(Error("Operational log queue is full"), { code: "ELOGQUEUE" });
    pending.set(file, bytes);
    try {
      await serializeOperationalFile(context, file, async () => {
        await retryOperationalFile(context, file, () => io.mkdir(path.dirname(file), { recursive: true }), retry);
        const size = await io.stat(file).then(value => value.size, error => { if (error.code === "ENOENT") return 0; throw error; });
        if (!rotations.has(file) && size + record.length > maximum) {
          rotations.set(file, { index: 0, steps: [
            () => io.rm(`${file}.${copies}`, { force: true }),
            ...Array.from({ length: copies }, (_, index) => {
              const from = index === copies - 1 ? file : `${file}.${copies - 1 - index}`;
              const to = `${file}.${copies - index}`;
              return async () => { try { await io.rename(from, to); } catch (error) { if (error.code !== "ENOENT") throw error; } };
            }),
          ] });
        }
        const rotation = rotations.get(file);
        if (rotation) {
          while (rotation.index < rotation.steps.length) {
            await retryOperationalFile(context, file, rotation.steps[rotation.index], retry); rotation.index++;
          }
          rotations.delete(file);
        }
        // An append error is ambiguous: do not replay bytes that may already exist.
        checked(context, file); await io.appendFile(file, record);
      });
    } finally { pending.set(file, (pending.get(file) ?? record.length) - record.length); }
  };
}
