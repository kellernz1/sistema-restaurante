import fs from "node:fs";
import path from "node:path";
import {ROOT} from "./lib.mjs";
import {providerMetadata} from "./restaurant-provider.mjs";
import {createBackup,validateBackup} from "./backup.mjs";

// Refuse before even loading a default database/container when spawned in a wrong checkout.
const meta=providerMetadata(ROOT),marker=path.join(ROOT,".local-secrets/provision.json");
if(!meta||path.resolve(process.cwd())!==path.resolve(meta.root)||!fs.existsSync(marker)||!["configured","complete"].includes(JSON.parse(fs.readFileSync(marker,"utf8")).stage))throw Error("Owned restaurant provisioning backup context required");
const file=await createBackup({reason:"restaurant-provision",container:`supabase_db_${meta.project}`});
await validateBackup(file,{container:`supabase_db_${meta.project}`});
