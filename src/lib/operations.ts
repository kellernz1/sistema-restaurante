import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const operationsDirectory = path.join(process.cwd(), ".local-secrets", "operations");
export const operationsPolicySchema = z.strictObject({
  interval_hours: z.number().int().min(1).max(168).default(6),
  after_cash_close: z.boolean().default(true),
  stale_hours: z.number().int().min(1).max(720).default(24),
  daily: z.number().int().min(1).max(365).default(14),
  weekly: z.number().int().min(1).max(104).default(8),
  external_directory: z.string().trim().max(1000).default("").refine(value => !value || (path.isAbsolute(value) && !/[\x00-\x1f]/.test(value)), "Absolute filesystem path required"),
  minimum_free_mb: z.number().int().min(100).max(100000).default(2048),
});
export type OperationsPolicy = z.infer<typeof operationsPolicySchema>;
export type OperationsState = {
  last_attempt?: string; last_success?: string; file?: string; result?: string;
  external?: string; external_at?: string; reason?: string; cash_event?: string;
  external_directory?: string;
  migration_warning?: boolean;
  supervisor?: { heartbeat: string; failures: string[]; processes: Record<string, number>; restarts: Record<string, number> };
};
export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}
export function atomicJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}
export function readOperationsPolicy(): OperationsPolicy {
  return operationsPolicySchema.parse(readJson(path.join(operationsDirectory, "policy.json"), {}));
}
export function readOperationsState(): OperationsState {
  return { ...readJson<OperationsState>(path.join(operationsDirectory, "state.json"), {}), supervisor: readJson<OperationsState["supervisor"]>(path.join(operationsDirectory,"supervisor.json"), undefined) };
}
export function patchOperationsState(update: Partial<OperationsState>) {
  const { supervisor: _supervisor, ...state } = readOperationsState();
  void _supervisor;
  atomicJson(path.join(operationsDirectory, "state.json"), { ...state, ...update });
}
export function operationAlerts(state: OperationsState, policy: OperationsPolicy, free: number | null, now = Date.now()) {
  const age = state.last_success ? now - Date.parse(state.last_success) : Infinity;
  const heartbeat=state.supervisor?Date.parse(state.supervisor.heartbeat):NaN;
  return {
    stale: !Number.isFinite(age) || age < -300000 || age > policy.stale_hours * 3600000 || !state.file || !fs.existsSync(state.file),
    external: !!policy.external_directory && (state.external !== "valid" || state.external_directory !== policy.external_directory),
    disk: free === null || !Number.isFinite(free) || free < policy.minimum_free_mb * 1024 * 1024,
    supervisor: !state.supervisor || !Number.isFinite(heartbeat) || now - heartbeat > 60000 || state.supervisor.failures.length > 0,
    failed: state.result === "failed",
    migration: state.migration_warning === true,
  };
}
export function operationsStatus() {
  const policy = readOperationsPolicy(), state = readOperationsState();
  let free: number | null = null;
  try { const disk = fs.statfsSync(process.cwd()); free = disk.bavail * disk.bsize; } catch { /* Unknown space is alerted. */ }
  return { policy, state, free_bytes: free, alerts: operationAlerts(state, policy, free) };
}
