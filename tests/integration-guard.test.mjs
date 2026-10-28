import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath}from "node:url";
import {randomBytes}from "node:crypto";
import {assertIntegrationEnvironment}from "./helpers/integration-guard.mjs";
import {createDisposableTarget} from "../scripts/target-safety.mjs";

test("integration guard refuses ordinary development configuration",()=>{
 assert.throws(()=>assertIntegrationEnvironment({PUBLIC_TEST_URL:"http://127.0.0.1:3000",NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321"}),/disposable runner/);
});
test("integration guard rejects mixed URLs, wrong ownership and expired runs",()=>{
 const id=randomBytes(12).toString("hex"),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),directory=path.join(root,"artifacts","integration",id);
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,"owner.json");
 const marker={project:`mesa-it-${id}`,nonce:"guard-only-unit-test",apiPort:40001,dbPort:40002,appPort:40003,active:true};
 const env={INTEGRATION_RUN_DIR:directory,INTEGRATION_NONCE:marker.nonce,NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:40001",PUBLIC_TEST_URL:"http://127.0.0.1:40003",NEXT_PUBLIC_APP_URL:"http://127.0.0.1:40003"};
 const prior={...process.env};
 for(const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_APP_URL","PUBLIC_TEST_URL"])delete process.env[key];
 createDisposableTarget({root:path.join(directory,"app"),runDirectory:directory,project:marker.project,apiPort:40001,dbPort:40002,appPort:40003});
 try{
  fs.writeFileSync(file,JSON.stringify(marker));assert.equal(assertIntegrationEnvironment(env).project,marker.project);
  for(const key of ["PUBLIC_TEST_URL","NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_SUPABASE_URL"])assert.throws(()=>assertIntegrationEnvironment({...env,[key]:"http://127.0.0.1:3000"}),/Unsafe integration target/);
  assert.throws(()=>assertIntegrationEnvironment({...env,INTEGRATION_NONCE:"wrong"}),/ownership mismatch/);
  for(const dbPort of [54322,40009]){fs.writeFileSync(file,JSON.stringify({...marker,dbPort}));assert.throws(()=>assertIntegrationEnvironment(env),/Unsafe integration database port/);}
  fs.writeFileSync(file,JSON.stringify({...marker,active:false}));assert.throws(()=>assertIntegrationEnvironment(env),/expired instance/);
 }finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);if(path.dirname(directory)!==path.join(root,"artifacts","integration"))throw Error("Unsafe unit cleanup");fs.rmSync(directory,{recursive:true,force:true});}
});
