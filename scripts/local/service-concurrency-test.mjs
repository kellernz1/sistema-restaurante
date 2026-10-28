import assert from "node:assert/strict";
import {spawn,spawnSync} from "../target-process.mjs";
import {randomUUID,randomInt} from "node:crypto";
import {findDbContainer} from "./lib.mjs";
import {sqlTestDatabase} from "./sql-test-target.mjs";
export async function runServiceConcurrencyTest(){
 const database=sqlTestDatabase();if(!/^mesa_clean_[a-f0-9]{24}$/.test(database)){console.log("Service concurrency runs only in the disposable clean database.");return;}
 const container=findDbContainer(),args=["exec","-i",container,"psql","-X","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1","-At"];
 function query(source){const r=spawnSync("docker",args,{input:source,encoding:"utf8",windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
 function session(source){return new Promise((resolve,reject)=>{const p=spawn("docker",args,{windowsHide:true});let out="",error="";p.stdout.on("data",v=>out+=v);p.stderr.on("data",v=>error+=v);p.on("error",reject);p.on("exit",code=>code===0?resolve(out):reject(new Error(error)));p.stdin.end(source);});}
 const cashier=query("select id from public.profiles where role='cashier' and is_active limit 1"),admin=query("select id from public.profiles where role='admin' and is_active limit 1");
 const auth=id=>`select set_config('request.jwt.claim.role','authenticated',false);select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`;
 const open=id=>`begin;${auth(id)}do $$begin begin perform public.cash_session_command('${randomUUID()}','open','{"opening_amount":0}');exception when check_violation then null;end;end $$;select pg_sleep(0.2);commit;`;
 await Promise.all([session(open(cashier)),session(open(admin))]);
 assert.equal(query("select count(*) from public.cash_sessions where status='open'"),"1","Only one operator may open the shared drawer concurrently");
 const number=randomInt(850000,890000);query(`insert into public.tables(table_number,capacity) values(${number},2),(${number+1},2);update public.service_policy set pending_per_phone=1 where id;`);
 const tables=query(`select qr_token from public.tables where table_number in (${number},${number+1}) order by table_number`).split(/\r?\n/),product=query("select id from public.products where is_active limit 1");
 const payload=JSON.stringify({source:"qr",customer_name:"[DEMO] Concurrency",items:[{product_id:product,quantity:1}]});const request=randomUUID();
 const submit=(token,key,body)=>`begin;select set_config('request.jwt.claim.role','service_role',true);set local role service_role;select public.submit_qr_order('${token}','${key}','${body}');select pg_sleep(0.2);commit;`;
 await Promise.all([session(submit(tables[0],request,payload)),session(submit(tables[0],request,payload))]);
 assert.equal(query(`select count(*) from public.qr_requests where request_id='${request}'`),"1","Concurrent retry created duplicate requests");
 const phonePayload=JSON.stringify({...JSON.parse(payload),customer_phone:"+595981123457"});
 const limited=token=>`begin;select set_config('request.jwt.claim.role','service_role',true);set local role service_role;do $$begin begin perform public.submit_qr_order('${token}','${randomUUID()}','${phonePayload}');exception when check_violation then null;end;end $$;select pg_sleep(0.2);commit;`;
 await Promise.all(tables.map(token=>session(limited(token))));
 assert.equal(query("select count(*) from public.qr_requests where customer_phone='+595981123457' and status='pending'"),"1","Cross-table phone limit raced");
 console.log("Service concurrency passed: single drawer, QR retry and cross-table phone limit.");
}
