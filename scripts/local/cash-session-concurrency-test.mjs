import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import assert from "node:assert/strict";
import {findDbContainer,run} from "./lib.mjs";
import {sqlTestDatabase} from "./sql-test-target.mjs";
export async function runCashSessionConcurrencyTest(){
 const database=sqlTestDatabase();
 // Committed closed financial records are immutable. Only the disposable database is eligible.
 if(!database.startsWith("mesa_clean_")){console.log("Cash close concurrency runs in db:validate-clean only; no financial fixtures committed here.");return;}
 const container=findDbContainer(),args=["exec","-i",container,"psql","-X","-q","-tA","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"];
 const query=sql=>run("docker",[...args,"-c",sql],{capture:true}).stdout.trim();
 const cashier=query("select id from public.profiles where role='cashier' and is_active limit 1");
 const auth=`select set_config('request.jwt.claim.sub','${cashier}',false);set request.jwt.claim.role='authenticated';set role authenticated;`;
 query(auth+`select public.cash_session_command('${randomUUID()}','open','{"opening_amount":0}');`);
 const id=query(`select id from public.cash_sessions where operator_id='${cashier}' and status='open'`);
 const request=randomUUID(),body=JSON.stringify({session_id:id,counted_amount:0});
 function close(key,pause=false,allowConflict=false,payload=body){return new Promise((resolve,reject)=>{
  const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"],windowsHide:true});let output="",errors="";child.stdout.on("data",v=>{output+=v;});child.stderr.on("data",v=>{errors+=v;});child.on("error",reject);child.on("close",code=>code===0?resolve(output):reject(new Error(errors)));
  const statement=allowConflict?`do $$ begin begin perform public.cash_session_command('${key}','close','${payload}');exception when check_violation then null;end;end $$;`:`select public.cash_session_command('${key}','close','${payload}');`;
  child.stdin.end(`begin;${auth}${statement}${pause?"select pg_sleep(0.5);":""}commit;`);
 });}
 const results=await Promise.allSettled([close(request,true),close(request)]);for(const r of results)if(r.status==="rejected")throw r.reason;
 assert.equal(query(`select status||'|'||revision from public.cash_sessions where id='${id}'`),"closed|1");
 assert.equal(query(`select count(*) from public.cash_session_events where session_id='${id}' and action='close'`),"1");
 await close(randomUUID(),false,true);
 assert.equal(query(`select count(*) from public.cash_session_events where session_id='${id}' and action='close'`),"1");
 query(auth+`select public.cash_session_command('${randomUUID()}','open','{"opening_amount":0}');`);
 const second=query(`select id from public.cash_sessions where operator_id='${cashier}' and status='open'`);
 const secondBody=JSON.stringify({session_id:second,counted_amount:0});
 const tabs=await Promise.allSettled([close(randomUUID(),true,true,secondBody),close(randomUUID(),false,true,secondBody)]);
 for(const r of tabs)if(r.status==="rejected")throw r.reason;
 assert.equal(query(`select status||'|'||revision from public.cash_sessions where id='${second}'`),"closed|1");
 assert.equal(query(`select count(*) from public.cash_session_events where session_id='${second}' and action='close'`),"1");
 console.log("Cash close concurrency passed: same-key concurrent commits and second-tab conflict without duplicate closure.");
}
