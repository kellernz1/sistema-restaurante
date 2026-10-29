import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright-core";
import { integrationContext } from "./context.mjs";
import { resolveTarget, requireTransport, targetPath, targetFetch } from "../target-safety.mjs";
import { command, writeOperationalJson } from "../target-operations.mjs";
import { isProcessRunning } from "../local/lib.mjs";

integrationContext(); const target = resolveTarget(); requireTransport(target);
assert.equal(target.profile, "disposable");
const directory = path.dirname(process.env.TARGET_CONTEXT_FILE);
const evidence = { windows_handle: false, persistent_failure_survived: false, visible_alert: false, recovered: false };
// Linux still exercises deterministic faults in the native suite; this test needs Win32 share modes.
if (process.platform === "win32") {
  const heartbeat = targetPath(target, path.join(target.root, ".local-secrets/operations/supervisor.json"));
  const marker = targetPath(target, path.join(target.root, ".local-secrets/operations/resilience-lock-ready"));
  const snapshot = JSON.parse(fs.readFileSync(heartbeat, "utf8"));
  const pids = [snapshot.supervisor, ...Object.values(snapshot.processes)];
  assert.ok(pids.every(pid => Number.isInteger(pid) && isProcessRunning(pid)));
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  let holder, browser, auth;
  try {
    holder = command(target, "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; $handle=[IO.File]::Open(${quote(heartbeat)},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); try { [IO.File]::WriteAllText(${quote(marker)},'ready'); Start-Sleep -Milliseconds 85000 } finally { $handle.Dispose() }`], { timeout: 100000 });
    // Attach a handler immediately; the awaited promise below still propagates failures.
    void holder.catch(() => {});
    const readyDeadline = Date.now() + 10000;
    while (!fs.existsSync(marker) && Date.now() < readyDeadline) await delay(50);
    assert.ok(fs.existsSync(marker)); evidence.windows_handle = true;
    const frozen = fs.readFileSync(heartbeat, "utf8");
    while (Date.now() - Date.parse(JSON.parse(frozen).heartbeat) <= 62000) {
      assert.ok(pids.every(isProcessRunning), "A supervised process exited under file contention"); await delay(250);
    }
    assert.equal(fs.readFileSync(heartbeat, "utf8"), frozen, "Blocked heartbeat must remain intact");
    evidence.persistent_failure_survived = pids.every(isProcessRunning);
    const jar = new Map();
    auth = createServerClient(target.apiUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: entries => entries.forEach(({ name, value }) => jar.set(name, value)) } });
    const login = await auth.auth.signInWithPassword({ email: "caixa@restaurante.local", password: process.env.DEMO_PASSWORD });
    assert.equal(login.error, null);
    const response = await targetFetch(target, new URL("/api/staff/operations", target.appUrl), { headers: { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") } });
    assert.equal(response.status, 200); assert.equal((await response.json()).alerts.supervisor, true);
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const context = await browser.newContext(); await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: target.appUrl })));
    const page = await context.newPage(); await page.goto(target.appUrl + "/cashier", { waitUntil: "networkidle" });
    await page.locator('.operations-alerts [role="alert"]').filter({ hasText: "A supervisão dos serviços precisa de atenção." }).waitFor({ state: "visible" });
    await page.screenshot({ path: targetPath(target, path.join(directory, "supervisor-degraded.png")) }); evidence.visible_alert = true;
    await holder; holder = null;
    const recoveryDeadline = Date.now() + 20000;
    while (Date.now() < recoveryDeadline) {
      const value = JSON.parse(fs.readFileSync(heartbeat, "utf8"));
      if (Date.parse(value.heartbeat) > Date.parse(JSON.parse(frozen).heartbeat) && value.mode === "normal") { evidence.recovered = true; break; }
      await delay(250);
    }
    assert.equal(evidence.recovered, true); assert.ok(pids.every(isProcessRunning));
  } finally { if (holder) await holder.catch(() => {}); if (browser) await browser.close(); if (auth) await auth.auth.signOut({ scope: "local" }); }
}
await writeOperationalJson(target, path.join(directory, "supervisor-resilience.json"), evidence);
console.log(JSON.stringify(evidence));
