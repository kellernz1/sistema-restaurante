import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {run,ROOT} from "../scripts/local/lib.mjs";
import {generateProviderSecrets,composeSpec,secretFingerprints} from "../scripts/target-operations.mjs";
import {evaluatePreflight} from "../scripts/local/preflight.mjs";
import {provisionSchema,configurationHash} from "../scripts/local/provision.mjs";

test("child commands honor the requested working directory",()=>{
 const result=run(process.execPath,["-e","process.stdout.write(process.cwd())"],{cwd:os.tmpdir(),capture:true});
 assert.equal(path.resolve(result.stdout),path.resolve(os.tmpdir()));
});
test("restaurant provider credentials are independent and administrative services stay private",()=>{
 const a=generateProviderSecrets(),b=generateProviderSecrets();for(const key of Object.keys(a))assert.ok(a[key]!==b[key],"Credential equality; values omitted");
 assert.equal(a.JWT_SECRET.length,64);assert.equal(a.POSTGRES_PASSWORD.length,64);assert.equal(Object.keys(secretFingerprints(a)).length,Object.keys(a).length);
 const spec=composeSpec({project:"fixture",dbPort:34522,apiPort:34521,appUrl:"http://127.0.0.1:34500",apiUrl:"http://127.0.0.1:34521",bind:"0.0.0.0"});
 assert.equal(spec.services.studio,undefined);assert.deepEqual(spec.services.db.ports,["127.0.0.1:34522:5432"]);assert.equal(JSON.stringify(spec).includes(a.JWT_SECRET),false);
 assert.ok(spec.services.db.environment.PGOPTIONS.includes("log_statement=none"));
 assert.ok(spec.services.db.command.includes("hba_file=/etc/mesa/pg_hba.conf"));
});

test("provision backup refuses a checkout without owned restaurant metadata",()=>{
 const result=run(process.execPath,[path.join(ROOT,"scripts/local/provision-backup.mjs")],{cwd:os.tmpdir(),capture:true,allowFailure:true});
 assert.notEqual(result.status,0);assert.ok(result.stderr.includes("Owned restaurant provisioning backup context required"));
});
test("preflight fails closed and detects demo identities",()=>{
 assert.equal(evaluatePreflight({}).approved,false);
 const good={restaurant:true,demo:false,unique:true,studioDisabled:true,portsRestricted:true,backupValid:true,licenseValid:true,history:true,autostart:true,licenseMode:true};
 assert.equal(evaluatePreflight(good).approved,true);assert.equal(evaluatePreflight({...good,demo:true}).approved,false);
 for(const field of ["unique","studioDisabled","portsRestricted","backupValid","licenseValid","history","autostart","licenseMode"])assert.equal(evaluatePreflight({...good,[field]:false}).approved,false);
});
test("provisioning validates strong operator credentials and excludes them from configuration identity",()=>{
 const cfg={name:"Fixture",adminName:"Owner",adminEmail:"owner@example.invalid",adminPassword:"Fixture!987Aa",usesWaiter:false,tables:false,delivery:false,methods:["cash"],rate:"1400",ip:"127.0.0.1",backupDirectory:os.tmpdir()};
 const a=provisionSchema.parse(cfg),b=provisionSchema.parse({...cfg,adminPassword:"OtherFixture!76Aa"});assert.equal(configurationHash(a),configurationHash(b));
 assert.equal(provisionSchema.safeParse({...cfg,adminPassword:"weak"}).success,false);assert.equal(provisionSchema.safeParse({...cfg,usesWaiter:true}).success,false);assert.equal(provisionSchema.safeParse({...cfg,currency:"BRL"}).success,false);
});
