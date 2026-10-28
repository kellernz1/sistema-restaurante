import assert from "node:assert/strict";
import {spawn} from "../target-process.mjs";
import {randomUUID} from "node:crypto";
import {findDbContainer,run} from "./lib.mjs";
import {sqlTestDatabase} from "./sql-test-target.mjs";

export async function runApprovalConcurrencyTest(){
 const database=sqlTestDatabase();
 // Immutable audit fixtures cannot be deleted afterwards. Never commit them in development.
 if(!/^mesa_clean_[a-f0-9]{24}$/.test(database)){console.log("Approval concurrency requires db:validate-clean; skipped on development.");return;}
 const args=["exec","-i",findDbContainer(),"psql","-X","-q","-tA","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"];
 const query=sql=>run("docker",[...args,"-c",sql],{capture:true}).stdout.trim();
 const order=randomUUID(),grant=randomUUID();
 const actor=query("select id from public.profiles where role='cashier' and is_active limit 1");
 const approver=query("select id from public.profiles where role='admin' and is_active limit 1");
 query(`insert into public.orders(id,order_type,source,status,customer_name,customer_phone) values('${order}','pickup','waiter','open','__approval_concurrency__','+595981999904');insert into public.order_items(order_id,product_id,quantity,unit_price) select '${order}',id,1,0 from public.products where is_active limit 1;insert into public.approver_pins(user_id,pin_hash) values('${approver}',extensions.crypt('9876',extensions.gen_salt('bf',4))) on conflict(user_id) do nothing;`);
 const op=JSON.stringify({action:"discount",target:order,mode:"amount",value:1,reason:"Concurrency test"});
 const auth=`select set_config('request.jwt.claim.sub','${actor}',true);set local request.jwt.claim.role='authenticated';set local role authenticated;`;
 const binding=query(`begin;${auth}select public.sensitive_quote('${op}'::jsonb)->>'binding';rollback;`).split(/\r?\n/).at(-1);
 assert.match(binding,/^[a-f0-9]{64}$/);
 query(`insert into public.operation_authorizations(id,actor_id,approver_id,pin_version,binding,expires_at,request_id) select '${grant}','${actor}','${approver}',version,'${binding}',now()+interval '2 minutes',gen_random_uuid() from public.approver_pins where user_id='${approver}';`);
 const execute=request=>new Promise((resolve,reject)=>{
  const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"],windowsHide:true});let output="",error="";
  child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>error+=b);child.on("error",reject);child.on("close",code=>resolve({code,output,error}));
  child.stdin.end(`begin;${auth}select public.execute_sensitive_action('${request}','${op}'::jsonb,'${binding}','${grant}');select pg_sleep(0.3);commit;`);
 });
 const results=await Promise.all([execute(randomUUID()),execute(randomUUID())]);
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 assert.match(results.find(r=>r.code!==0).error,/Stale operation|Approval missing/);
 assert.equal(query(`select count(*) from public.audit_events where action='discount' and target_id='${order}'`),"1");
 assert.equal(query(`select count(*) from public.operation_authorizations where id='${grant}' and consumed_at is not null`),"1");
 console.log("Approval double-use across two PostgreSQL sessions: one action and one audit event.");
}
