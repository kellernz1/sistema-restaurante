import assert from "node:assert/strict";
import {spawn}from "../target-process.mjs";
import {randomUUID}from "node:crypto";
import {findDbContainer,run}from "./lib.mjs";
import {sqlTestDatabase}from "./sql-test-target.mjs";

export async function runRefundConcurrencyTest(){
 const database=sqlTestDatabase();
 if(!/^mesa_clean_[a-f0-9]{24}$/.test(database)){console.log("Refund concurrency requires db:validate-clean; skipped on development.");return;}
 const args=["exec","-i",findDbContainer(),"psql","-X","-q","-tA","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"];
 const query=sql=>run("docker",[...args,"-c",sql],{capture:true}).stdout.trim().split(/\r?\n/).at(-1);
 const actor=query("select id from public.profiles where role='cashier' and is_active limit 1"),admin=query("select id from public.profiles where role='admin' and is_active limit 1");
 query("update public.cash_session_policy set single_open_session=false;update public.restaurant_settings set counter_payment_timing='at_order',is_accepting_orders=true,enabled_payment_methods=array['cash']::public.payment_method[];update public.service_policy set counter_enabled=true;");
 const auth=id=>`select set_config('request.jwt.claim.sub','${id}',true);set local request.jwt.claim.role='authenticated';set local role authenticated;`;
 for(const id of [admin,actor])if(query(`select count(*)from public.cash_sessions where operator_id='${id}'and status='open'`)==="0")query(`begin;${auth(id)}select public.cash_session_command('${randomUUID()}','open','{"opening_amount":100000}');commit;`);
 const product=query("select id from public.products where is_active limit 1");query(`update public.products set price=50000 where id='${product}';insert into public.approver_pins(user_id,pin_hash)values('${admin}',extensions.crypt('9876',extensions.gen_salt('bf',4)))on conflict(user_id)do nothing;`);
 for(const sameKey of [false,true]){
  const payload=JSON.stringify({items:[{product_id:product,quantity:1}]}),lines=JSON.stringify([{method:"cash",currency:"PYG",amount_pyg:50000,original_amount:60000}]);
  const order=query(`begin;${auth(admin)}select public.create_counter_order('${randomUUID()}','${payload}','${lines}')->'order'->>'id';commit;`);
  const op=JSON.stringify({action:"cancel_refund",target:order,reason:"Concurrent refund test"});
  const binding=query(`begin;${auth(actor)}select public.refund_quote('${op}')->>'binding';rollback;`),grant=randomUUID(),request=randomUUID();
  assert.match(binding,/^[a-f0-9]{64}$/);
  query(`insert into public.operation_authorizations(id,actor_id,approver_id,pin_version,binding,expires_at,request_id)select '${grant}','${actor}','${admin}',version,'${binding}',now()+interval '2 minutes',gen_random_uuid()from public.approver_pins where user_id='${admin}';`);
  const execute=key=>new Promise((resolve,reject)=>{
   const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"],windowsHide:true});let output="",error="";
   child.stdout.on("data",b=>output+=b);child.stderr.on("data",b=>error+=b);child.on("error",reject);child.on("close",code=>resolve({code,output,error}));
   child.stdin.end(`begin;${auth(actor)}select public.execute_refund('${key}','${op}','${binding}','${grant}',true);select pg_sleep(0.2);commit;`);
  });
  const results=await Promise.all([execute(request),execute(sameKey?request:randomUUID())]);
  assert.equal(results.filter(r=>r.code===0).length,sameKey?2:1,JSON.stringify(results));
  assert.equal(query(`select sum(amount_pyg)from public.refunds where order_id='${order}'`),"50000");
  assert.equal(query(`select count(*)from public.refunds where order_id='${order}'`),"1");
  assert.equal(query(`select count(*)from public.audit_events where action='refund'and target_id='${order}'`),"1");
  assert.equal(query(`select count(*)from public.kitchen_cancellations where order_id='${order}'`),"1");
 }
 console.log("Refund concurrency: distinct requests consume approval once; identical retries replay one ledger/audit/cancellation.");
}
