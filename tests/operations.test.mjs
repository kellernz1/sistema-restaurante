import {directoryTarget,createFilesystemTarget} from "../scripts/target-safety.mjs";


import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupName, atomicDump, publishFile, checksum, retainedFiles, assertVersion, validateBackup, copyExternal } from "../scripts/target-operations.mjs";
import { command, rotateLog } from "../scripts/local/operations-process.mjs";
import { operationsPolicySchema, operationAlerts } from "../src/lib/operations.ts";
import { assertTemporary } from "../scripts/target-operations.mjs";
import { taskPlan } from "../scripts/local/autostart.mjs";
import { RestartBudget, backupReason } from "../scripts/local/restart-budget.mjs";

test("automatic backups honor intervals, committed closure times and retry cooldown",()=>{
 const now=Date.parse("2026-10-25T12:00:00Z"),policy=operationsPolicySchema.parse({});
 const state={last_success:new Date(now-3600000).toISOString()};
 assert.equal(backupReason(state,policy,0,null,now),null);
 assert.equal(backupReason({},policy,0,null,now),"interval");
 assert.equal(backupReason({last_success:new Date(now-7*3600000).toISOString()},policy,0,null,now),"interval");
 const close=new Date(now-60000).toISOString();
 assert.equal(backupReason(state,policy,0,close,now),"cash-close");
 assert.equal(backupReason(state,{...policy,after_cash_close:false},0,close,now),null);
 assert.equal(backupReason({},policy,now-1000,close,now),null);
});

test("supervisor retries are bounded separately per service",()=>{
 const budget=new RestartBudget();
 assert.deepEqual(Array.from({length:6},()=>budget.take("app")),[3000,6000,9000,12000,15000,null]);
 assert.equal(budget.take("worker"),3000);assert.equal(budget.attempts.app,5);
});

test("atomic backup publication never exposes a partial file or overwrites a valid file", async () => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-backup-")), file=path.join(directory,"valid.dump");
 try {
  await assert.rejects(()=>atomicDump(createFilesystemTarget(directory),file,temporary=>command(createFilesystemTarget(directory),process.execPath,["-e","process.stdout.write('partial');process.exit(1)"],{output:temporary}),()=>{}));
  assert.deepEqual(fs.readdirSync(directory),[]);
  await assert.rejects(()=>atomicDump(createFilesystemTarget(directory),file,temporary=>fs.writeFileSync(temporary,"invalid"),()=>{throw new Error("Bad structure");}));
  assert.deepEqual(fs.readdirSync(directory),[]);
  await atomicDump(createFilesystemTarget(directory),file,temporary=>fs.writeFileSync(temporary,"valid"),()=>{});
  const other=path.join(directory,"other.tmp");fs.writeFileSync(other,"overwrite");
  assert.throws(()=>publishFile(createFilesystemTarget(directory),other,file));assert.equal(fs.readFileSync(file,"utf8"),"valid");
  const names=new Set(Array.from({length:100},()=>backupName(new Date("2026-10-25T12:00:00Z"))));assert.equal(names.size,100);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test("retention preserves last valid and daily/weekly representatives",()=>{
 const values=Array.from({length:100},(_,index)=>({file:String(index),created_at:new Date(Date.UTC(2026,9,25)-index*86400000).toISOString()}));
 const keep=retainedFiles(values,14,8);assert.ok(keep.has("0"));assert.ok(keep.size>=14);assert.ok(keep.size<=22);
 assert.deepEqual([...retainedFiles(values.slice(0,1),1,1)],["0"]);
});
test("manifest/checksum/version validation refuses corrupt or newer backups before contacting Docker",async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-manifest-")),file=path.join(directory,"fixture.dump");
 try {
  fs.writeFileSync(file,"backup");const hash=await checksum(file);
  const base={file:"fixture.dump",result:"valid",format:"pg-custom-v1",migration:"202610250018",created_at:new Date().toISOString(),app_version:"0.1.0",bytes:6,sha256:hash};
  for(const change of [{sha256:"0".repeat(64)},{bytes:7},{migration:"999999999999"},{app_migration:"999999999999"},{created_at:"invalid"},{result:"failed"},{file:"../evil"}]){
   fs.writeFileSync(`${file}.json`,JSON.stringify({...base,...change}));await assert.rejects(()=>validateBackup(file,{container:"must-not-run"}));
  }
  assert.throws(()=>assertVersion("999999999999"));assert.doesNotThrow(()=>assertVersion("202610250018"));
  assert.throws(()=>assertTemporary("postgres"));assert.throws(()=>assertTemporary("mesa_restore_short"));
 } finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test("external copy checks bytes and never silently replaces existing copies",async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-external-")),external=path.join(directory,"external"),file=path.join(directory,"fixture.dump");
 try{
  fs.mkdirSync(external);fs.writeFileSync(file,"backup");fs.writeFileSync(`${file}.json`,"{}");
  await copyExternal(createFilesystemTarget(directory),file,directoryTarget(createFilesystemTarget(directory),external,{external:true}));assert.equal(await checksum(path.join(external,"fixture.dump")),await checksum(file));
  await assert.rejects(()=>copyExternal(createFilesystemTarget(directory),file,directoryTarget(createFilesystemTarget(directory),external,{external:true})));await assert.rejects(()=>copyExternal(createFilesystemTarget(directory),file,directoryTarget(createFilesystemTarget(directory),path.join(directory,"unavailable"),{external:true})));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test("age, copy, disk and supervisor alerts are conservative",()=>{
 const policy=operationsPolicySchema.parse({}),now=Date.parse("2026-10-25T12:00:00Z");
 assert.equal(operationAlerts({},policy,10e9,now).stale,true);
 assert.equal(operationAlerts({},policy,10,now).disk,true);
 assert.equal(operationAlerts({},policy,null,now).disk,true);
 assert.equal(operationAlerts({},policy,NaN,now).disk,true);
 assert.equal(operationAlerts({}, {...policy,external_directory:os.tmpdir()},10e9,now).external,true);
 assert.equal(operationAlerts({external:"valid",external_directory:"old"},{...policy,external_directory:os.tmpdir()},10e9,now).external,true);
 assert.equal(operationAlerts({last_success:"invalid"},policy,10e9,now).stale,true);
 assert.equal(operationAlerts({supervisor:{heartbeat:new Date(now).toISOString(),failures:[],processes:{},restarts:{}}},policy,10e9,now).supervisor,false);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-age-")),file=path.join(directory,"backup.dump");
 try{fs.writeFileSync(file,"backup");assert.equal(operationAlerts({file,last_success:new Date(now-3600000).toISOString()},policy,10e9,now).stale,false);assert.equal(operationAlerts({file,last_success:new Date(now-25*3600000).toISOString()},policy,10e9,now).stale,true);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test("Windows task plans are deterministic idempotent dry-run plans with explicit paths",()=>{
 for(const action of ["install","remove"]){assert.deepEqual(taskPlan(action),taskPlan(action));}
 assert.match(taskPlan("install").args.at(-1),/-Force/);assert.match(taskPlan("remove").args.at(-1),/SilentlyContinue/);
 assert.match(taskPlan("install").args.at(-1),/-AtLogOn/);assert.throws(()=>taskPlan("unknown"));
});
test("log rotation caps generations",()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-log-")),file=path.join(directory,"worker.log");
 try{for(let index=0;index<8;index++){fs.writeFileSync(file,"123456");rotateLog(createFilesystemTarget(directory),file,5,3);}assert.equal(fs.readdirSync(directory).length,3);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});
