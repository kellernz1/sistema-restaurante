import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { compareHistory,localMigrations,isolatedDatabaseUrl } from "../scripts/local/migration-history.mjs";
import { schemaDifferences,normalizeConfiguration } from "../scripts/local/audit-history.mjs";
import { assertIsolated } from "../scripts/local/isolated-database.mjs";

test("history detects missing, orphaned and renamed entries",()=>{
 const files=[{version:"001",name:"first",file:"001_first.sql"},{version:"002",name:"second",file:"002_second.sql"}];
 assert.equal(compareHistory(files,files.map(({version,name})=>({version,name}))).ok,true);
 const report=compareHistory(files,[{version:"001",name:"edited"},{version:"999",name:"unknown"}]);
 assert.equal(report.ok,false);assert.equal(report.missing[0].version,"002");assert.equal(report.orphaned[0].version,"999");assert.equal(report.renamed[0].version,"001");
});
test("migration discovery rejects duplicate versions and invalid SQL filenames",()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-history-"));
 try{fs.writeFileSync(path.join(directory,"001_first.sql"),"select 1;");assert.equal(localMigrations(directory).length,1);fs.writeFileSync(path.join(directory,"001_second.sql"),"select 2;");assert.throws(()=>localMigrations(directory),/Duplicate/);fs.unlinkSync(path.join(directory,"001_second.sql"));fs.writeFileSync(path.join(directory,"missing_version.sql"),"");assert.throws(()=>localMigrations(directory),/Invalid/);}
 finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test("temporary migration and cleanup guards never admit the development database",()=>{
 for(const name of ["postgres","template1","_supabase","mesa_history_wrong"]){assert.throws(()=>isolatedDatabaseUrl(name));assert.throws(()=>assertIsolated(name));}
 const name="mesa_history_"+"a".repeat(24);assert.doesNotThrow(()=>assertIsolated(name));const url=new URL(isolatedDatabaseUrl(name));assert.equal(url.pathname,"/"+name);assert.equal(url.hostname,"127.0.0.1");
});
test("schema comparison ignores row and object-key order but preserves meaningful array order and multiplicity",()=>{
 const entry={category:"columns",key:"orders.total",value:{type:"bigint",not_null:true}};
 assert.deepEqual(schemaDifferences([entry],[{...entry,value:{not_null:true,type:"bigint"}}]),[]);
 assert.equal(schemaDifferences([entry],[entry,entry]).length,1);
 const enums={category:"types",key:"status",value:{labels:["open","closed"]}};
 assert.equal(schemaDifferences([enums],[{...enums,value:{labels:["closed","open"]}}]).length,1);
 assert.equal(schemaDifferences([entry],[{...entry,value:{type:"numeric",not_null:true}}]).length,1);
});
test("security changes are real differences",()=>{
 for(const category of ["function_grants","policies","relations","functions"]){const before={category,key:"test",value:{owner:"postgres",grantable:false,rls:true}};assert.equal(schemaDifferences([before],[{...before,value:{owner:"anon",grantable:true,rls:false}}]).length,1);}
});
test("configuration normalization removes generated device identities without hiding operational settings",()=>{
 const config=id=>({print_devices:[{id,name:"Printer",driver:"browser",last_success_at:null}],print_destinations:[{name:"kitchen",device_id:id,receipt_timing:"on_demand"}],print_processor_lease:[{id:true,owner_id:id,expires_at:"now"}],restaurant_settings:[{id:true,delivery_fee:6000}]});
 assert.deepEqual(normalizeConfiguration(config("one")),normalizeConfiguration(config("two")));
 const changed=config("two");changed.restaurant_settings[0].delivery_fee=7000;assert.notDeepEqual(normalizeConfiguration(config("one")),normalizeConfiguration(changed));
});
