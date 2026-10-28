import { isMain, loadEnvFile } from "./lib.mjs";
import {providerMetadata} from "../target-operations.mjs";
import {ROOT} from "./lib.mjs";

const accounts = [
  ["Administrador", "admin@restaurante.local", "/admin"],
  ["Garçom", "garcom@restaurante.local", "/waiter"],
  ["Garçom 2", "garcom2@restaurante.local", "/waiter"],
  ["Cozinha", "cozinha@restaurante.local", "/kitchen"],
  ["Caixa", "caixa@restaurante.local", "/cashier"],
];

export async function printLocalInfo() {
  const env = loadEnvFile();
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const apiUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!appUrl || !apiUrl) throw new Error("Run `npm run local:env` first.");

  console.log("\nRestaurant local stack");
  console.log(`LAN IP: ${env.LOCAL_LAN_IP || new URL(appUrl).hostname}`);
  console.log(`App: ${appUrl}`);
  console.log(`Supabase API: ${apiUrl}`);
  console.log(providerMetadata(ROOT)?"Studio disabled in the restaurant profile.":"Development Studio: http://127.0.0.1:54323");
  console.log(`Public ordering: ${appUrl}/order`);
  if(env.WHATSAPP_MOCK==="true")console.log(`WhatsApp simulator: ${appUrl}/dev/whatsapp`);
  if(env.DEMO_PASSWORD){
    console.log("\nDemonstration staff accounts:");
    for (const [role, email, route] of accounts)console.log(`- ${role}: ${email} -> ${appUrl}${route}`);
  }else{
    console.log("Use the administrator created during provisioning; manage staff in Settings.");
  }
  console.log("Credentials are omitted. Read the protected local environment; never share it.");

  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    console.warn("\nTable QR URLs unavailable: server Supabase key is missing.");
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/rest/v1/tables?select=table_number,qr_token&order=table_number.asc`, {
      headers: { apikey: secret },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.json();
    console.log("\nTable QR URLs:");
    console.log("Open the QR administration screen to view table links; tokens are not printed.");
  } catch (error) {
    console.warn(`\nTable QR URLs unavailable (${error instanceof Error ? error.message : "unknown error"}). Is Supabase running?`);
  }
}

if (isMain(import.meta.url)) {
  await printLocalInfo();
}
