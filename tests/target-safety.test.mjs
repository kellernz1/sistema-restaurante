import {resolveTarget,createDisposableTarget,assertTarget,authorizeOperation,targetPath,databaseTarget,allocateDatabase,assertExecution,operationRequiresConfirmation,productionPolicyTarget,pendingBootTarget,targetFetch} from "../scripts/target-safety.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes,createHmac} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createClient} from "../scripts/target-client.mjs";

import {createBackup,copyExternal,publishFile,databaseSql,restoreToTemporary,migrateIsolated,providerSql,retention} from "../scripts/target-operations.mjs";

function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-safety-")),root=path.join(directory,"app"),before={...process.env};
 for(const k of ["TARGET_CONTEXT_FILE","TARGET_CONTEXT_TOKEN","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_APP_URL","PUBLIC_TEST_URL"])delete process.env[k];
 const result=createDisposableTarget({root,runDirectory:directory,project:"mesa-it-"+randomBytes(12).toString("hex"),apiPort:31001,dbPort:31002,appPort:31003});
 return {...result,directory,root,close(){for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);fs.rmSync(directory,{recursive:true,force:true});}};
}
test("missing target and development override are refused in a test before any transport",()=>{
 const saved={...process.env},argv=[...process.argv];
 try{delete process.env.TARGET_CONTEXT_FILE;delete process.env.TARGET_CONTEXT_TOKEN;process.argv.push("--allow-development","--installation-id","11111111-1111-4111-8111-111111111111");assert.throws(()=>resolveTarget(),/Target safety refused/);}
 finally{process.argv.splice(0,process.argv.length,...argv);for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
test("forged capabilities fail before helpers perform SQL, HTTP or file writes",async()=>{
 const ctx=Object.freeze({profile:"disposable",root:os.tmpdir(),container:"supabase_db_sistema-restaurante",database:"postgres"});
 for(const call of [()=>createBackup(ctx),()=>copyExternal(ctx,"ignored",Object.freeze({path:"ignored"})),()=>databaseSql(ctx,"select 1"),()=>restoreToTemporary(ctx,"ignored")])await assert.rejects(call,/Target safety refused/);
 for(const call of [()=>publishFile(ctx,"ignored","ignored"),()=>migrateIsolated(ctx),()=>providerSql(ctx,"select 1")])assert.throws(call,/Target safety refused/);
});
test("container, database, path and cwd must belong to the same capability",()=>{
 const f=fixture(),cwd=process.cwd();try{
  assert.equal(assertTarget(f.context),f.context);
  assert.throws(()=>assertExecution(f.context,"docker",["exec","supabase_db_sistema-restaurante","psql","-d","postgres"]));
  assert.throws(()=>databaseTarget(f.context,"mesa_clean_"+randomBytes(12).toString("hex")));
  assert.throws(()=>targetPath(f.context,path.join(os.tmpdir(),"foreign-backups")));
  assert.throws(()=>authorizeOperation({...f.context},"backup"));
  const child=allocateDatabase(f.context,"clean");assert.equal(databaseTarget(f.context,child.database).database,child.database);
  process.chdir(os.tmpdir());assert.throws(()=>assertTarget(f.context));
 }finally{process.chdir(cwd);f.close();}
});
test("owner marker tampering, expiry and mixed URLs fail closed",()=>{
 const f=fixture();try{
  const file=process.env.TARGET_CONTEXT_FILE,raw=fs.readFileSync(file,"utf8"),envelope=JSON.parse(raw);
  envelope.data.container="supabase_db_sistema-restaurante";fs.writeFileSync(file,JSON.stringify(envelope));assert.throws(()=>assertTarget(f.context));
  fs.writeFileSync(file,raw);process.env.NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321";assert.throws(()=>resolveTarget());delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  const expired=JSON.parse(raw);expired.data.expires=0;expired.signature=createHmac("sha256",process.env.TARGET_CONTEXT_TOKEN).update(JSON.stringify(expired.data)).digest("hex");fs.writeFileSync(file,JSON.stringify(expired));assert.throws(()=>assertTarget(f.context));
 }finally{f.close();}
});
test("junction or symlink replacement cannot redirect owned backup files",()=>{
 const f=fixture(),foreign=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-foreign-"));try{
  fs.symlinkSync(foreign,path.join(f.root,"backups"),process.platform==="win32"?"junction":"dir");assert.throws(()=>targetPath(f.context,path.join(f.root,"backups/foreign.dump")));
  assert.deepEqual(fs.readdirSync(foreign),[]);
 }finally{fs.unlinkSync(path.join(f.root,"backups"));f.close();fs.rmSync(foreign,{recursive:true,force:true});}
});
test("production demo, cleanup, reset, repair and migration require enhanced authorization",()=>{
 for(const op of ["demo","clear-demo","reset","migration","repair","replace"])assert.equal(operationRequiresConfirmation("production",op),true);
 assert.equal(operationRequiresConfirmation("production","backup"),false);assert.equal(operationRequiresConfirmation("production","migration",false),false);
 const f=fixture();try{const context=productionPolicyTarget(f.context);for(const op of ["demo","clear-demo","reset","migration","repair","replace"])assert.throws(()=>authorizeOperation(context,op));assert.doesNotThrow(()=>authorizeOperation(context,"backup"));}finally{f.close();}
});
test("temporary retention refuses another backup directory before reading or deleting it",async()=>{
 const f=fixture(),foreign=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-retention-")),file=path.join(foreign,"keep.dump");
 try{fs.writeFileSync(file,"foreign backup");await assert.rejects(()=>retention(f.context,foreign,{daily:1,weekly:1},file));assert.equal(fs.readFileSync(file,"utf8"),"foreign backup");}
 finally{f.close();fs.rmSync(foreign,{recursive:true,force:true});}
});
test("maintenance entry points reject a test override without changing development files",()=>{
 const root=path.resolve(import.meta.dirname,".."),backup=path.join(root,"backups"),state=path.join(root,".local-secrets/operations/state.json");
 const snapshot=()=>JSON.stringify({files:fs.existsSync(backup)?fs.readdirSync(backup).sort():[],state:fs.existsSync(state)?fs.readFileSync(state,"utf8"):null});
 const before=snapshot();
 const copy=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-rejected-entry-"));
 try{
  for(const directory of ["scripts","src"])fs.cpSync(path.join(root,directory),path.join(copy,directory),{recursive:true});
  fs.symlinkSync(path.join(root,"node_modules"),path.join(copy,"node_modules"),process.platform==="win32"?"junction":"dir");
  const scripts=["local/backup","local/setup","local/update","local/reset","local/restore","local/reconcile-history","seed-demo","clear-demo","local/start","local/stop","local/env","local/rotate-test-credentials"];
  for(const script of scripts){const r=spawnSync(process.execPath,[path.join(copy,"scripts",script+".mjs"),"--execute","--allow-development","--installation-id","11111111-1111-4111-8111-111111111111"],{cwd:copy,encoding:"utf8",timeout:5000,windowsHide:true,env:{...process.env,NODE_ENV:"test",TARGET_CONTEXT_FILE:"",TARGET_CONTEXT_TOKEN:"",INTEGRATION_RUN_DIR:"",NEXT_PUBLIC_SUPABASE_URL:"",SUPABASE_SECRET_KEY:""}});assert.notEqual(r.status,0,script+" must refuse");}
  assert.equal(snapshot()===before,true,"Rejected commands changed development backup/state");
  assert.equal(fs.existsSync(path.join(copy,"backups")),false);assert.equal(fs.existsSync(path.join(copy,".local-secrets/operations/state.json")),false);
 }finally{const link=path.join(copy,"node_modules");if(fs.existsSync(link))fs.unlinkSync(link);if(!path.resolve(copy).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error("Unsafe unit cleanup");fs.rmSync(copy,{recursive:true,force:true});}
});
test("missing target refuses HTTP client construction before mutable fetch",()=>{
 const prior={...process.env};let calls=0;
 try{delete process.env.TARGET_CONTEXT_FILE;delete process.env.TARGET_CONTEXT_TOKEN;assert.throws(()=>createClient("http://127.0.0.1:54321","fixture",{global:{fetch:()=>{calls++;throw Error("unexpected transport");}}}));assert.equal(calls,0);}
 finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});
test("boot capability cannot write SQL, backups or HTTP until live identity verification",()=>{
 const f=fixture();try{const boot=pendingBootTarget(f.context);assert.equal(boot.ready,false);assert.doesNotThrow(()=>authorizeOperation(boot,"boot"));for(const op of ["sql","backup","runtime","file"])assert.throws(()=>authorizeOperation(boot,op));assert.throws(()=>targetFetch(boot,boot.appUrl+"/api/whatsapp/process",{method:"POST"}));}finally{f.close();}
});
