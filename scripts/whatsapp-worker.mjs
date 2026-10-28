import {guardEntry,resolveTarget,targetFetch} from "./target-safety.mjs";
import { loadEnvFile } from "./local/lib.mjs";
await guardEntry(import.meta.url,"runtime");


const env = { ...loadEnvFile(), ...process.env };
const appUrl = env.NEXT_PUBLIC_APP_URL;
const secret = env.WHATSAPP_WORKER_SECRET;
if (!appUrl || !secret) throw new Error("NEXT_PUBLIC_APP_URL and WHATSAPP_WORKER_SECRET are required. Run `npm run local:env`.");

const baseDelay = 30_000;
const maxDelay = 5 * 60_000;
let failures = 0;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { stopping = true; });
}

async function processQueue() {
  const response = await targetFetch(resolveTarget(),new URL("/api/whatsapp/process", appUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) throw new Error(`worker endpoint returned HTTP ${response.status}`);
  const result = await response.json();
  console.log(`${new Date().toISOString()} WhatsApp queue processed: ${result.processed ?? 0}`);
}

console.log(`${new Date().toISOString()} WhatsApp worker started for ${appUrl}.`);
while (!stopping) {
  try {
    await processQueue();
    failures = 0;
  } catch (error) {
    failures += 1;
    console.error(`${new Date().toISOString()} WhatsApp worker error: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const delay = Math.min(maxDelay, baseDelay * 2 ** Math.min(failures, 4));
  await new Promise((resolve) => setTimeout(resolve, delay));
}
console.log(`${new Date().toISOString()} WhatsApp worker stopped.`);
