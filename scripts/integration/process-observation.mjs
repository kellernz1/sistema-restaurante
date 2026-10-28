import { setTimeout as delay } from "node:timers/promises";

/** Check throughout the observation window, including after the last wait. */
export async function observeProcesses({ check, durationMs, intervalMs = 250 }) {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("A positive observation duration and interval are required");
  }
  const started = performance.now();
  const deadline = started + durationMs;
  let checks = 0;
  do {
    await check();
    checks++;
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await delay(Math.min(intervalMs, remaining));
  } while (true);
  return { durationMs: Math.round(performance.now() - started), checks };
}
