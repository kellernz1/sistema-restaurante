import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, ROOT } from "./local/lib.mjs";
import { FilePrintDriver } from "./printing-file-driver.mjs";
import { processOnePrint } from "./printing-process.mjs";
import { printRpc,PRINT_WORKER_VERSION } from "./printing-deadline.mjs";

const env = { ...loadEnvFile(), ...process.env };
if (env.APP_MODE !== "local" && env.NODE_ENV !== "development") throw new Error("Test-file printing requires local/development mode");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = randomUUID();
const driver = new FilePrintDriver(path.join(ROOT, ".local-secrets", "print-output"));
let stopping = false;
let heartbeatBusy=false;
async function heartbeat(){
 if(heartbeatBusy||stopping)return;heartbeatBusy=true;
 try{const result=await printRpc(db,"print_worker_heartbeat",{p_instance:owner,p_version:PRINT_WORKER_VERSION,p_driver:"file"});if(result.error)throw result.error;}
 catch{console.error(`${new Date().toISOString()} Print heartbeat unavailable; reconnecting`);}
 finally{heartbeatBusy=false;}
}
const heartbeatTimer=setInterval(()=>void heartbeat(),10000);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });
while (!stopping) {
  try {
    await heartbeat();
    const status = await processOnePrint({ db, owner, driver, appUrl: env.NEXT_PUBLIC_APP_URL });
    if (status) console.log(`${new Date().toISOString()} Print job result: ${status}`);
  } catch { console.error(`${new Date().toISOString()} Print worker unavailable; reconnecting without resending uncertain jobs`); }
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
clearInterval(heartbeatTimer);
