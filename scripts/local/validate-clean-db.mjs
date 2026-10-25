import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { findDbContainer, ROOT, run } from "./lib.mjs";

// A separate database in the local cluster: no reset, migration or data write targets postgres.
const database=`mesa_clean_${randomBytes(12).toString("hex")}`;
if(!/^mesa_clean_[a-f0-9]{24}$/.test(database))throw new Error("Unsafe temporary database name");
const container=findDbContainer();
function sql(source){
 const result=spawnSync("docker",["exec","-i",container,"psql","-X","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"],{input:source,encoding:"utf8",maxBuffer:20*1024*1024,windowsHide:true});
 if(result.status!==0)throw new Error(result.stderr||result.error?.message||"Temporary SQL failed");
 return result.stdout;
}
run("docker",["exec",container,"createdb","-U","postgres","--template=template0",database],{capture:true});
console.log(`Created isolated database ${database}; development database is untouched.`);
try{
 // Copy Supabase Auth definitions only, never users or application schema/data.
 const auth=run("docker",["exec",container,"pg_dump","-U","postgres","-d","postgres","--schema-only","--section=pre-data","--schema=auth","--no-owner","--no-privileges"],{capture:true}).stdout;
 sql(`create schema extensions; create publication supabase_realtime; ${auth}
 alter table auth.users add primary key(id);
 grant usage on schema public,auth,extensions to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant all on tables to service_role;
 alter default privileges for role postgres in schema public grant all on sequences to service_role;
 `);
 const files=fs.readdirSync(path.join(ROOT,"supabase/migrations")).filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
 for(const file of files){sql(fs.readFileSync(path.join(ROOT,"supabase/migrations",file),"utf8"));console.log(`Applied ${file}`);}
 sql(`insert into auth.users(id,email,raw_user_meta_data) select gen_random_uuid(),email,jsonb_build_object('full_name','Clean test') from (values('admin@restaurante.local'),('caixa@restaurante.local'),('cozinha@restaurante.local'),('garcom@restaurante.local'),('garcom2@restaurante.local')) v(email);`);
 sql(fs.readFileSync(path.join(ROOT,"supabase/seed.sql"),"utf8"));
 const result=run(process.execPath,["scripts/local/sql-tests.mjs"],{capture:true,allowFailure:true,env:{SQL_TEST_DATABASE:database}});
 if(result.status!==0)throw new Error(result.stdout.slice(-2500)+"\n"+result.stderr);
 console.log(`CLEAN VALIDATION PASSED: ${files.length} ordered migrations, seed and all SQL suites/concurrency tests.`);
}finally{
 // Only this randomly named, isolated database is eligible for deletion.
 if(!/^mesa_clean_[a-f0-9]{24}$/.test(database))throw new Error("Refusing database cleanup");
 run("docker",["exec",container,"dropdb","-U","postgres",database],{capture:true});
 console.log(`Removed isolated database ${database}. Development database was not reset.`);
}
