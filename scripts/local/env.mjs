import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { publicKeyConfiguration } from "../../src/features/licensing/validation.ts";
import {providerMetadata} from "./restaurant-provider.mjs";

import {
  ensureDirectory,
  isMain,
  LOCAL_STATE_DIR,
  loadEnvFile,
  parseEnv,
  readOption,
  resolveLanIp,
  ROOT,
  runSupabase,
  writeEnvFile,
} from "./lib.mjs";

export function generateLocalEnv({ ip = readOption("--ip"),demo=false } = {}) {
  if(publicKeyConfiguration(loadEnvFile().LICENSE_PUBLIC_KEY)==="invalid")throw new Error("LICENSE_PUBLIC_KEY must contain exactly 64 hexadecimal characters. Fix its format before generating the environment.");
  const lanIp = resolveLanIp(ip);
  if (lanIp === "127.0.0.1") {
    console.warn("WARNING: only a loopback address was detected. Phones and tablets will not connect until you rerun local:env with --ip <LAN_IP>.");
  }

  const status = runSupabase(["status", "-o", "env"], { capture: true });
  const local = parseEnv(status.stdout);
  const publishable = local.PUBLISHABLE_KEY ?? local.ANON_KEY;
  const secret = local.SECRET_KEY ?? local.SERVICE_ROLE_KEY;
  if (!publishable || !secret) {
    throw new Error("Supabase status did not return publishable/secret keys. Update the CLI or inspect `npx supabase status -o env`.");
  }

  ensureDirectory(LOCAL_STATE_DIR);
  const secretsFile = path.join(LOCAL_STATE_DIR, "runtime.json");
  const existingSecrets = fs.existsSync(secretsFile)
    ? JSON.parse(fs.readFileSync(secretsFile, "utf8"))
    : {};
  const workerSecret = existingSecrets.whatsappWorkerSecret ?? randomBytes(32).toString("hex");
  fs.writeFileSync(secretsFile, JSON.stringify({ whatsappWorkerSecret: workerSecret }, null, 2));

  const current = loadEnvFile();
  const provider=providerMetadata(ROOT);
  if(provider&&current.DEMO_PASSWORD)throw new Error("Restaurant profile cannot retain demo credentials");
  const appUrl = `http://${lanIp}:${provider?.appPort??3000}`;
  const apiUrl = `http://${lanIp}:${new URL(local.API_URL).port||54321}`;
  const next = {
    ...current,
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
    SUPABASE_SECRET_KEY: secret,
    NEXT_PUBLIC_APP_URL: appUrl,
    NEXT_TELEMETRY_DISABLED: "1",
    APP_MODE: "local",
    WHATSAPP_MOCK: provider?"false":"true",
    WHATSAPP_WORKER_SECRET: workerSecret,
    PUBLIC_TRUST_PROXY: "false",
    PUBLIC_TEST_URL: appUrl,
    LOCAL_LAN_IP: lanIp,
    ...(demo?{DEMO_PASSWORD:current.DEMO_PASSWORD||randomBytes(24).toString("base64url")}:{}),
  };
  delete next.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete next.SUPABASE_SERVICE_ROLE_KEY;
  writeEnvFile(next);
  console.log(`Generated ${path.relative(ROOT, path.join(ROOT, ".env.local"))} for ${lanIp}.`);
  console.log(`App: ${appUrl}`);
  console.log(`Supabase API: ${apiUrl}`);
  return next;
}

if (isMain(import.meta.url)) {
  generateLocalEnv();
}
