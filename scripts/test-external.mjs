import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { ensureDirectory, isWindows, loadEnvFile, LOG_DIR, ROOT, run } from "./local/lib.mjs";

const env = { ...loadEnvFile(), ...process.env };
if (env.APP_MODE !== "local" || env.WHATSAPP_MOCK !== "true") {
  throw new Error("External smoke tests require APP_MODE=local and WHATSAPP_MOCK=true. Run local:setup first.");
}
const port = Number(env.EXTERNAL_TEST_PORT || 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid EXTERNAL_TEST_PORT.");
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});

// Disposable credentials belong only to this isolated mock server and its tests.
const verifyToken = randomBytes(32).toString("hex");
const appSecret = randomBytes(32).toString("hex");
Object.assign(env, {
  WHATSAPP_VERIFY_TOKEN: verifyToken, WEBHOOK_TEST_TOKEN: verifyToken,
  WHATSAPP_APP_SECRET: appSecret, WEBHOOK_TEST_SECRET: appSecret,
  WHATSAPP_PHONE_NUMBER_ID: "local-webhook-test", DELIVERY_ROUTE_SMOKE: "true",
  PUBLIC_TEST_URL: `http://127.0.0.1:${port}`, NEXT_TELEMETRY_DISABLED: "1",
});

run(process.execPath, [path.join(ROOT, "scripts", "next-command.mjs"), "build"], { env });
ensureDirectory(LOG_DIR);
const output = fs.openSync(path.join(LOG_DIR, "external-test-server.log"), "a");
const server = spawn(process.execPath, [path.join(ROOT, "scripts", "next-command.mjs"), "start", "--port", String(port), "--hostname", "127.0.0.1"], {
  cwd: ROOT, env, windowsHide: true, detached: !isWindows, stdio: ["ignore", output, output],
});
let startupError;
server.once("error", (error) => { startupError = error; });
try {
  let healthy = false;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error("Test server stopped. See logs/external-test-server.log.");
    try {
      healthy = (await fetch(`${env.PUBLIC_TEST_URL}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
      if (healthy) break;
    } catch { /* Wait for the server to bind. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!healthy) throw new Error("Local database is unavailable. Start Docker and Supabase before running test:external.");
  console.log("Running all suites with local webhook credentials and a real road-routing request.");
  run(process.execPath, [path.join(ROOT, "scripts", "run-all-tests.mjs")], { env });
} finally {
  if (server.pid && server.exitCode === null) {
    if (isWindows) run("taskkill", ["/PID", String(server.pid), "/T", "/F"], { capture: true, allowFailure: true });
    else process.kill(-server.pid, "SIGTERM");
  }
  fs.closeSync(output);
}
