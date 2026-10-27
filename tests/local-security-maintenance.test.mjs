import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {replaceAssignments,rotateAuthUsers,assertLocalTarget} from "../scripts/local/rotate-test-credentials.mjs";
import {firewallPlan} from "../scripts/local/firewall.mjs";

test("credential replacement changes only authorized assignments and refuses ambiguity",()=>{
 const before="# configuration\nWHATSAPP_WORKER_SECRET=old-fixture\nDEMO_PASSWORD=old-fixture\nSUPABASE_SECRET_KEY=provider-fixture\n";
 const after=replaceAssignments(before,{WHATSAPP_WORKER_SECRET:"new-fixture",DEMO_PASSWORD:"new-fixture"});
 assert.ok(after.includes("SUPABASE_SECRET_KEY=provider-fixture"));assert.ok(after.startsWith("# configuration\n"));
 assert.throws(()=>replaceAssignments(before+"DEMO_PASSWORD=duplicate\n",{DEMO_PASSWORD:"new-fixture"}));
 assert.throws(()=>replaceAssignments(before,{DEMO_PASSWORD:"invalid\nassignment"}));
});
test("credential maintenance rejects cloud and ambiguous provider targets",()=>{
 for(const url of ["http://127.0.0.1:54321","http://192.168.1.20:54321","http://[::1]:54321"])assert.doesNotThrow(()=>assertLocalTarget(url));
 for(const url of ["https://example.supabase.co","http://192.168.1.20.example.invalid:54321","http://8.8.8.8:54321","http://localhost:54321/path"])assert.throws(()=>assertLocalTarget(url));
});
test("Auth rotation globally revokes sessions and validates new/old credentials without returning them",async()=>{
 let updated=false,revoked=false;
 const admin={auth:{admin:{updateUserById:async()=>{updated=true;return{data:{},error:null};},signOut:async(_,scope)=>{assert.equal(scope,"global");revoked=true;return{error:null};}}}};
 const makePublicClient=()=>({auth:{signInWithPassword:async({password})=>password==="new-fixture"||!updated?{data:{session:{access_token:"access-fixture",refresh_token:"refresh-fixture"}}}:{data:{},error:{code:"rejected"}},refreshSession:async()=>revoked?{error:{code:"revoked"}}:{data:{}}}});
 const result=await rotateAuthUsers({admin,users:[{id:"user-fixture",email:"example@example.invalid"}],password:"new-fixture",oldPassword:"old-fixture",makePublicClient});
 assert.equal(result.sessions_globally_revoked,1);assert.equal(result.old_passwords_rejected,1);assert.equal(result.old_refresh_tokens_rejected,1);
 assert.equal(JSON.stringify(result).includes("fixture"),false);
});
test("maintenance and firewall dry runs are repeatable and perform no system actions",()=>{
 for(const script of ["scripts/local/rotate-test-credentials.mjs","scripts/local/firewall.mjs"]){
  const a=spawnSync(process.execPath,[script,"--dry-run"],{encoding:"utf8",windowsHide:true}),b=spawnSync(process.execPath,[script,"--dry-run"],{encoding:"utf8",windowsHide:true});
  assert.equal(a.status,0);assert.equal(a.stdout,b.stdout);assert.match(a.stdout,/DRY RUN/);
 }
});
test("firewall plan blocks only administrative ports and excludes IPv4/IPv6 loopback",()=>{
 const plan=firewallPlan();assert.deepEqual(plan.ports,[54322,54323]);assert.deepEqual(plan.preserved_lan_ports,[3000,54321]);
 const source=plan.args.at(-1);assert.match(source,/Set-NetFirewallRule/);assert.match(source,/New-NetFirewallRule/);assert.match(source,/Profile Any/);assert.match(source,/::2-/);
 assert.equal(source.includes("Set-NetFirewallProfile"),false);assert.equal(source.includes("-RemoteAddress Any"),false);
 const remove=firewallPlan("remove").args.at(-1);assert.match(remove,/Remove-NetFirewallRule/);assert.equal(remove.includes("New-NetFirewallRule"),false);
 const invalid=spawnSync(process.execPath,["scripts/local/firewall.mjs","unknown-action","--apply"],{encoding:"utf8",windowsHide:true});assert.equal(invalid.status,1);
});
