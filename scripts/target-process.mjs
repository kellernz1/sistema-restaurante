import {spawn as rawSpawn,spawnSync as rawSpawnSync,execFileSync as rawExecFileSync} from "node:child_process";
import {resolveTarget,assertExecution} from "./target-safety.mjs";
import path from "node:path";

function inspect(binary,args,options={}){
 if(["psql","pg_dump","pg_restore","createdb","dropdb"].includes(path.basename(binary).replace(/[.]exe$/i,"")))throw Error("Bare database transports are forbidden; use the owned Docker context");
 if(binary==="docker"&&args.some(a=>["exec","psql","pg_dump","pg_restore","createdb","dropdb","restart"].includes(a)))assertExecution(resolveTarget(),binary,args,options);
}
export function spawn(binary,args,options){inspect(binary,args,options);return rawSpawn(binary,args,options);}
export function spawnSync(binary,args,options){inspect(binary,args,options);return rawSpawnSync(binary,args,options);}
export function execFileSync(binary,args,options){inspect(binary,args,options);return rawExecFileSync(binary,args,options);}
