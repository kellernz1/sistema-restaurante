import {directoryTarget,resolveTarget} from "../target-safety.mjs";

import fs from "node:fs";
import path from "node:path";
import {ROOT} from "./lib.mjs";
import {providerMetadata} from "../target-operations.mjs";
import {createBackup,validateBackup,copyExternal} from "../target-operations.mjs";

// Refuse before even loading a default database/container when spawned in a wrong checkout.
const meta=providerMetadata(ROOT),marker=path.join(ROOT,".local-secrets/provision.json");
if(!meta||path.resolve(process.cwd())!==path.resolve(meta.root)||!fs.existsSync(marker)||!["configured","complete"].includes(JSON.parse(fs.readFileSync(marker,"utf8")).stage))throw Error("Owned restaurant provisioning backup context required");
const file=await createBackup(resolveTarget(),{reason:"restaurant-provision"});
await validateBackup(file,{container:`supabase_db_${meta.project}`});
if(resolveTarget().profile==="disposable"){
 const policy=JSON.parse(fs.readFileSync(path.join(ROOT,".local-secrets/operations/policy.json"),"utf8"));
 if(policy.external_directory)await copyExternal(resolveTarget(),file,directoryTarget(resolveTarget(),policy.external_directory,{external:true}));
}
