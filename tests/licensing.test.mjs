import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID,createPublicKey}from "node:crypto";
import {spawnSync}from "node:child_process";
import {generateKeys,withRegistry,extend,issue,decodeLicense}from "../owner-tools/licensing/core.mjs";
import {createLicenseServer}from "../owner-tools/licensing/server.mjs";
import {verifyLicenseToken,renewLicense}from "../scripts/license-renewal.mjs";
import {licenseFixtures}from "./helpers/license-fixture.mjs";
test("Ed25519 rejects modified payload, signature and unrelated public key",()=>{
 const id=randomUUID(),f=licenseFixtures(id),other=licenseFixtures(id);assert.equal(verifyLicenseToken(f.tokens.active,f.key).installation_id,id);
 assert.throws(()=>verifyLicenseToken(f.tokens.active,other.key));
 const parts=f.tokens.active.split(".");parts[0]=Buffer.from(JSON.stringify({...f.base,installation_id:randomUUID()})).toString("base64url");assert.throws(()=>verifyLicenseToken(parts.join("."),f.key));
 assert.throws(()=>verifyLicenseToken(f.tokens.active.slice(0,-4)+"abcd",f.key));
});
test("owner CLI generates keys outside the application, issues, extends and lists",()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-owner-license-")),registry=path.join(directory,"registry.json"),id=randomUUID();
 const run=(...args)=>{const r=spawnSync(process.execPath,["owner-tools/licensing/cli.mjs",...args],{encoding:"utf8",env:{...process.env,APP_MODE:""},windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 try{
  run("keygen","--directory",directory);const keys=JSON.parse(fs.readFileSync(path.join(directory,"public.json"),"utf8")),key=path.join(directory,"private.pem");
  const request=randomUUID(),argumentsList=["issue","--key",key,"--registry",registry,"--installation",id,"--restaurant","Test restaurant","--days","30","--grace","7","--plan","pilot","--request",request];
  const first=run(...argumentsList);assert.equal(run(...argumentsList),first);
  const claims=verifyLicenseToken(first,keys.public_key);assert.deepEqual(claims.features,["delivery","whatsapp"]);assert.equal(claims.sequence,1);
  const second=run("extend","--key",key,"--registry",registry,"--installation",id,"--days","30");assert.equal(verifyLicenseToken(second,keys.public_key).sequence,2);
  assert.equal(JSON.parse(run("list","--registry",registry))[0].issued_count,2);
  const refused=spawnSync(process.execPath,["owner-tools/licensing/cli.mjs","keygen","--directory",process.cwd()],{encoding:"utf8",env:{...process.env,APP_MODE:""},windowsHide:true});assert.notEqual(refused.status,0);assert.match(refused.stderr,/outside/);
 }finally{assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
});
test("owner CLI publishes a nonempty file atomically and refuses failed or overwriting output",()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-owner-output-")),registry=path.join(directory,"registry.json"),output=path.join(directory,"test.license"),id=randomUUID();
 const run=(...args)=>spawnSync(process.execPath,["owner-tools/licensing/cli.mjs",...args],{encoding:"utf8",env:{...process.env,APP_MODE:""},windowsHide:true});
 try{
  assert.equal(run("keygen","--directory",directory).status,0);
  const args=["issue","--key",path.join(directory,"private.pem"),"--registry",registry,"--installation",id,"--restaurant","Test","--days","1","--grace","1","--request",randomUUID(),"--out",output];
  const failed=run(...args.map(x=>x===id?"invalid":x));assert.notEqual(failed.status,0);assert.equal(fs.existsSync(output),false);assert.equal(failed.stdout,"");assert.match(failed.stderr,/Invalid installation UUID/);
  const success=run(...args);assert.equal(success.status,0);assert.equal(success.stdout.trim(),"License file created successfully.");assert.ok(fs.statSync(output).size>20);
  const before=fs.readFileSync(output);const repeated=run(...args);assert.notEqual(repeated.status,0);assert.ok(fs.readFileSync(output).equals(before));assert.match(repeated.stderr,/Output already exists/);
  assert.equal(fs.readdirSync(directory).some(n=>n.endsWith(".tmp")),false);
  const missing=run(...args.map(x=>x===path.join(directory,"private.pem")?path.join(directory,"missing.pem"):x));assert.notEqual(missing.status,0);assert.equal(missing.stderr.includes(directory),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test("reference server authenticates administration and binds idempotent renewal to installation/nonce",async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-reference-license-")),registryFile=path.join(directory,"registry.json"),id=randomUUID();generateKeys(directory);const privateKey=fs.readFileSync(path.join(directory,"private.pem"),"utf8");
 const token=withRegistry(registryFile,r=>{extend(r,id,{restaurant:"Reference",days:30,grace:7});return issue(r,id,privateKey);});
 const adminToken="x".repeat(48),server=createLicenseServer({privateKey,registryFile,adminToken});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(route,body,admin=false)=>fetch(base+route,{method:"POST",headers:{"content-type":"application/json",...(admin?{authorization:"Bearer "+adminToken}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+"/admin/installations/"+id)).status,401);
  const nonce=randomUUID(),body={installation_id:id,nonce,license:token};const a=await post("/v1/renew",body),b=await post("/v1/renew",body);assert.equal(a.status,200);assert.deepEqual(await a.json(),await b.json());
  assert.equal((await post("/v1/renew",{...body,installation_id:randomUUID()})).status,400);
  const request_id=randomUUID(),extension={request_id,days:30};const e=await post(`/admin/installations/${id}/extend`,extension,true),retry=await post(`/admin/installations/${id}/extend`,extension,true);assert.equal(e.status,200);assert.deepEqual(await e.json(),await retry.json());
  assert.equal((await post(`/admin/installations/${id}/extend`,{...extension,days:31},true)).status,400);
  assert.equal((await post(`/admin/installations/${id}/suspend`,{request_id:randomUUID(),suspended:true},true)).status,200);
  const suspended=await(await post("/v1/renew",{...body,nonce:randomUUID()})).json();assert.equal(verifyLicenseToken(suspended.license,JSON.parse(fs.readFileSync(path.join(directory,"public.json"),"utf8")).public_key).suspended,true);
  const state=await(await fetch(base+"/admin/installations/"+id,{headers:{authorization:"Bearer "+adminToken}})).json();assert.equal(state.suspended,true);assert.equal("privateKey"in state,false);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
test("renewal connection/proof failure preserves current license and records bounded failure",async()=>{
 const calls=[],nonce=randomUUID(),f=licenseFixtures(randomUUID());
 const db={rpc(name,args){calls.push({name,args});return{abortSignal:async()=>name==="license_renewal_claim"?{data:{nonce,url:"http://127.0.0.1:1/v1/renew",installation_id:f.base.installation_id,license:f.tokens.active}}:{data:{state:"active"}}};}};
 const r=await renewLicense(db,{force:true});assert.equal(r.failed,true);assert.equal(calls.at(-1).name,"license_renewal_finish");assert.equal(calls.at(-1).args.p_nonce,nonce);assert.equal(calls.at(-1).args.p_token,undefined);
 assert.equal(decodeLicense(f.tokens.active,createPublicKey(f.pem).export({type:"spki",format:"pem"})).sequence,1);
});
