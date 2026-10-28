import fs from "node:fs";
import path from "node:path";
import {atomicJson as writeJson} from "../src/lib/operations.ts";
import {authorizeOperation,targetPath} from "./target-safety.mjs";

export function atomicJson(context,file,value,{purpose="runtime"}={}){authorizeOperation(context,purpose);writeJson(targetPath(context,file),value);}
export function patchOperationsState(context,update,{purpose="runtime"}={}){
 authorizeOperation(context,purpose);
 const file=targetPath(context,path.join(context.root,".local-secrets/operations/state.json"));
 const current=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):{};
 delete current.supervisor;writeJson(file,{...current,...update});
}
