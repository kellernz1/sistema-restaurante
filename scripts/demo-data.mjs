import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import { ensureDirectory, loadEnvFile, LOCAL_STATE_DIR } from "./local/lib.mjs";

export const DEMO_EMAILS = [
  "admin@restaurante.local",
  "garcom@restaurante.local",
  "garcom2@restaurante.local",
  "cozinha@restaurante.local",
  "caixa@restaurante.local",
];
export const DEMO_PHONES = ["+5511999990001", "+5511999990002"];
export const DEMO_MANIFEST = path.join(LOCAL_STATE_DIR, "demo.json");

export function demoClient() {
  const env = { ...loadEnvFile(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Run `npm run local:env` before seeding demo data.");
  return {
    client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    password: env.DEMO_PASSWORD || "Demo@12345",
  };
}

export function assertResult(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export function readManifest() {
  return fs.existsSync(DEMO_MANIFEST)
    ? JSON.parse(fs.readFileSync(DEMO_MANIFEST, "utf8"))
    : {};
}

export function writeManifest(manifest) {
  ensureDirectory(LOCAL_STATE_DIR);
  fs.writeFileSync(DEMO_MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
}
