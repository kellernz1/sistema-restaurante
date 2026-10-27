import {spawnSync} from "node:child_process";
import fs from "node:fs";

// Never return matching text, variable values, blob IDs, diffs or commit messages.
function git(args,input){
 const r=spawnSync("git",args,{input,encoding:"utf8",maxBuffer:128*1024*1024,windowsHide:true});
 if(r.status!==0)throw Error("Git path audit failed; no content was logged");
 return r.stdout;
}
const sensitivePath=p=>!/(^|\/)\.env\.example$/.test(p)&&(
 /(^|\/)(\.env(?:[./_-]|$)|[^/]+\.env(?:\.|$)|private[^/]*\.(?:json|pem|key)|id_(?:rsa|ed25519))/.test(p)
 ||/\.(?:pem|key|p12|pfx|jks|license|lic)(?:\.|$)/i.test(p)
 ||/(^|\/)(?:license-registry[^/]*\.json|registry\.json(?:\.|$)|licensing\/registry[^/]*\.json)/i.test(p)
);
const candidate=content=>/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(content)
 ||/\bsb_secret_[A-Za-z0-9_-]{16,}/.test(content)
 ||/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/.test(content)
 ||/\b(?:SUPABASE_SECRET_KEY|WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|WHATSAPP_WORKER_SECRET|LICENSE_ADMIN_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_-]{24,}/.test(content);
const tracked=git(["ls-files","-z"]).split("\0").filter(Boolean);
const names=git(["rev-list","--objects","--all","--reflog"]).split(/\r?\n/).map(line=>line.match(/^([a-f0-9]+) (.+)$/)).filter(Boolean);
const currentPaths=tracked.filter(sensitivePath),historyPaths=new Set(),contentPaths=new Set();
for(const p of git(["log","--all","--reflog","--format=","--name-only","--no-renames"]).split(/\r?\n/).filter(Boolean))if(sensitivePath(p))historyPaths.add(p);
for(const p of tracked)if(fs.existsSync(p)&&fs.statSync(p).isFile()&&candidate(fs.readFileSync(p,"utf8")))contentPaths.add(p);
const batch=spawnSync("git",["cat-file","--batch"],{input:names.map(m=>m[1]).join("\n")+"\n",maxBuffer:256*1024*1024,windowsHide:true});
if(batch.status!==0)throw Error("Git object audit failed; no content was logged");
let offset=0;
for(const [, ,p]of names){
 const end=batch.stdout.indexOf(10,offset),header=batch.stdout.subarray(offset,end).toString("ascii").split(" ");
 if(end<offset||header.length!==3)throw Error("Git audit framing failed; no content was logged");
 const size=Number(header[2]);if(!Number.isSafeInteger(size)||size<0)throw Error("Git audit size invalid");
 const start=end+1;offset=start+size+1;
 if(header[1]==="blob"&&candidate(batch.stdout.subarray(start,start+size).toString("utf8")))contentPaths.add(p);
}
console.log(JSON.stringify({tracked_sensitive_paths:currentPaths.sort(),history_sensitive_paths:[...historyPaths].sort(),history_content_candidate_paths:[...contentPaths].sort()},null,2));
