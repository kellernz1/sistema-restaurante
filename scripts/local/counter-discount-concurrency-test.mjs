import assert from "node:assert/strict";
import {spawn} from "../target-process.mjs";
import {randomUUID} from "node:crypto";
import {findDbContainer,run} from "./lib.mjs";
import {sqlTestDatabase} from "./sql-test-target.mjs";
export async function runCounterDiscountConcurrencyTest(){
 const database=sqlTestDatabase();if(!/^mesa_clean_[a-f0-9]{24}$/.test(database)){console.log("Counter discount concurrency runs only in db:validate-clean.");return;}
 const args=["exec","-i",findDbContainer(),"psql","-X","-q","-tA","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1"];
 const query=sql=>run("docker",[...args,"-c",sql],{capture:true}).stdout.trim();
 const actor=query("select id from public.profiles where role='cashier'and is_active limit 1"),approver=query("select id from public.profiles where role='admin'and is_active limit 1");
 const product=query("select id from public.products where is_active and price>1 limit 1"),draft=randomUUID(),grant=randomUUID();
 const payload=JSON.stringify({name:"__counter_concurrent__",items:[{product_id:product,quantity:1,notes:"Test"}]}),discount=JSON.stringify({mode:"amount",value:1,reason:"Concurrency test"});
 const auth=`select set_config('request.jwt.claim.sub','${actor}',true);set local request.jwt.claim.role='authenticated';set local role authenticated;`;
 // Other concurrency fixtures can leave a shared session open in this disposable database.
 // This scenario tests discounted creation, not shared-drawer exclusivity.
 query(`update public.cash_session_policy set single_open_session=false where id;update public.service_policy set counter_enabled=true where id;update public.restaurant_settings set counter_payment_timing='at_order',is_accepting_orders=true,enabled_payment_methods=array['cash']::public.payment_method[] where id;`);
 if(query(`select count(*)from public.cash_sessions where operator_id='${actor}'and status='open'`)==="0")query(`begin;${auth}select public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}');commit;`);
 const quote=JSON.parse(query(`begin;${auth}select public.counter_discount_quote('${draft}','${payload}','${discount}');commit;`).split(/\r?\n/).at(-1));
 query(`insert into public.approver_pins(user_id,pin_hash)values('${approver}',extensions.crypt('9876',extensions.gen_salt('bf',4)))on conflict(user_id)do nothing;insert into public.operation_authorizations(id,actor_id,approver_id,pin_version,binding,expires_at,request_id)select '${grant}','${actor}','${approver}',version,'${quote.binding}',now()+interval '2 minutes',gen_random_uuid()from public.approver_pins where user_id='${approver}';`);
 const body=JSON.stringify({...JSON.parse(payload),discount:{...JSON.parse(discount),draft_id:draft,binding:quote.binding,authorization:grant}}),lines=JSON.stringify([{method:"cash",currency:"PYG",amount_pyg:quote.total,original_amount:quote.total}]);
 const execute=request=>new Promise((resolve,reject)=>{const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"],windowsHide:true});let error="";child.stderr.on("data",b=>error+=b);child.on("error",reject);child.on("close",code=>resolve({code,error}));child.stdin.end(`begin;${auth}select public.create_counter_order('${request}','${body}','${lines}');select pg_sleep(0.2);commit;`);});
 const results=await Promise.all([execute(randomUUID()),execute(randomUUID())]);assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 assert.equal(query(`select count(*)from public.counter_discount_claims where draft_id='${draft}'and order_id is not null`),"1");
 assert.equal(query(`select count(*)from public.audit_events where action='discount'and target_id=(select order_id from public.counter_discount_claims where draft_id='${draft}')`),"1");
 console.log("Concurrent discounted counter creation: one order, payment and discount event.");
}
