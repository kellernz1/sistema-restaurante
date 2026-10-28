import assert from "node:assert/strict";
import {spawn} from "../target-process.mjs";
import {randomUUID} from "node:crypto";
import {findDbContainer,run} from "./lib.mjs";
import {sqlTestDatabase} from "./sql-test-target.mjs";

export async function runPrintDocumentConcurrencyTest(){
 const container=findDbContainer(),order=randomUUID(),owner=randomUUID();
 const args=["exec","-i",container,"psql","-X","-q","-tA","-U","postgres","-d",sqlTestDatabase(),"-v","ON_ERROR_STOP=1"];
 const query=sql=>run("docker",[...args,"-c",sql],{capture:true}).stdout.trim();
 const prior=query("select coalesce(owner_id::text,''),expires_at::text from public.print_processor_lease where id and expires_at<=now()");
 if(!prior)throw new Error("Stop print processors before the document concurrency test");
 const [priorOwner,priorExpiry]=prior.split("|");
 const kitchen=query("select id from public.profiles where role='kitchen' and is_active limit 1");
 if(!/^[a-f0-9-]{36}$/.test(kitchen))throw new Error("Kitchen test user missing");
 query(`begin; insert into public.orders(id,order_type,source,status,customer_name,customer_phone) values('${order}','pickup','waiter','open','__print_concurrency__','+595981999904');insert into public.order_items(order_id,product_id,quantity,unit_price) select '${order}',id,1,0 from public.products where is_active limit 1; commit;`);
 const job=query(`select id from public.print_jobs where order_id='${order}'`);
 if(!/^[a-f0-9-]{36}$/.test(job))throw new Error("Print fixture missing");
 try{
  for(const status of ["processing","uncertain"]){
   const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"],windowsHide:true});let output="",errors="";
   const done=new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(errors)));});
   const locked=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Concurrent session timed out")),10000);child.stdout.on("data",chunk=>{output+=chunk;if(output.includes("DOCUMENT_LOCKED")){clearTimeout(timer);resolve();}});child.on("close",()=>{clearTimeout(timer);if(!output.includes("DOCUMENT_LOCKED"))reject(new Error(errors));});});
   child.stderr.on("data",chunk=>{errors+=chunk;});
   child.stdin.end(`begin;select 1 from public.print_processor_lease where id for update;update public.print_processor_lease set owner_id='${owner}',expires_at=now()+interval '2 minutes' where id;update public.print_jobs set status='${status}',owner_id='${owner}',claim_token=gen_random_uuid() where id='${job}';select 'DOCUMENT_LOCKED';select pg_sleep(0.5);commit;`);
   try{
    await locked;
    query(`select set_config('request.jwt.claim.sub','${kitchen}',false);set request.jwt.claim.role='authenticated';set role authenticated;do $$ begin
      begin perform public.request_print(gen_random_uuid(),'kitchen','${order}');raise exception 'Full order bypassed active ${status} transport';exception when check_violation then null;end;
      begin perform public.request_print(gen_random_uuid(),null,null,'${job}');raise exception 'Job ID bypassed active ${status} transport';exception when check_violation then null;end;
    end $$;`);
   }finally{await done;}
   assert.equal(query(`select count(*) from public.print_jobs where order_id='${order}'`),"1");
  }
 }finally{
  // Delete only the synthetic order and restore only our sentinel lease owner.
  query(`delete from public.orders where id='${order}';update public.print_processor_lease set owner_id=${priorOwner?`'${priorOwner}'::uuid`:"null"},expires_at='${priorExpiry}'::timestamptz where id and owner_id='${owner}';`);
 }
 console.log("Both print request paths rejected processing/live-uncertain delivery across two PostgreSQL sessions.");
}
