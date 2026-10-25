import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
const base=process.env.PUBLIC_TEST_URL,api=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
test("print engine uses immutable deltas, secure configuration and idempotent manual reprints",{skip:!(base&&api&&key&&secret)},async()=>{
 const service=createClient(api,secret,{auth:{persistSession:false,autoRefreshToken:false}});let orderId,testJob,deviceId;const clients=[];
 async function login(role){const jar=new Map();const db=createServerClient(api,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:role+"@restaurante.local",password:process.env.DEMO_PASSWORD||"Demo@12345"})).error);clients.push(db);return {cookie:[...jar].map(([name,value])=>name+"="+value).join("; "),"content-type":"application/json"};}
 const post=(payload,headers)=>fetch(base+"/api/staff/printing",{method:"POST",headers,body:JSON.stringify(payload)});
 try{
  const admin=await login("admin"),cashier=await login("caixa"),waiter=await login("garcom"),kitchen=await login("cozinha");
  assert.equal((await fetch(base+"/api/staff/printing")).status,401);
  assert.equal((await fetch(base+"/api/staff/printing/health")).status,401);
  assert.equal((await fetch(base+"/api/staff/printing/health",{headers:waiter})).status,403);
  const health=await fetch(base+"/api/staff/printing/health",{headers:cashier});assert.equal(health.status,200);const hb=await health.json();assert.equal(typeof hb.stall_seconds,"number");assert.ok(Array.isArray(hb.workers));
  assert.equal((await fetch(base+"/api/staff/printing",{method:"PATCH",headers:cashier,body:JSON.stringify({type:"policy",stall_seconds:60})})).status,403);
  assert.equal((await fetch(base+"/api/staff/printing",{headers:waiter})).status,403);
  const list=await fetch(base+"/api/staff/printing",{headers:cashier});assert.equal(list.status,200);const state=await list.json();assert.ok(state.jobs.every(j=>!("claim_token"in j)&&!("owner_id"in j)));
  assert.equal((await fetch(base+"/api/staff/printing",{method:"PATCH",headers:cashier,body:JSON.stringify({type:"device"})})).status,403);
  assert.equal((await post({action:"request",request_id:randomUUID(),kind:"test",destination:"kitchen"},cashier)).status,403);
  deviceId=randomUUID();const config={type:"device",id:deviceId,name:"__print_http_device__",driver:"browser",paper_mm:58,columns:32,codepage:"cp850",codepage_number:2,locale:"es"};
  assert.equal((await fetch(base+"/api/staff/printing",{method:"PATCH",headers:admin,body:JSON.stringify(config)})).status,200);
  assert.equal((await fetch(base+"/api/staff/printing",{method:"PATCH",headers:admin,body:JSON.stringify({...config,columns:34})})).status,200);
  const product=await service.from("products").select("id").eq("is_active",true).limit(1).single();assert.ifError(product.error);
  const created=await service.from("orders").insert({order_type:"pickup",source:"waiter",status:"pending_confirmation",customer_name:"__print_4a_http__",customer_phone:"+595981999902"}).select("id").single();assert.ifError(created.error);orderId=created.data.id;
  assert.ifError((await service.from("order_items").insert({order_id:orderId,product_id:product.data.id,quantity:2,unit_price:0,notes:"Original"})).error);
  assert.ifError((await service.from("orders").update({status:"open"}).eq("id",orderId)).error);
  const initial=await service.from("print_jobs").select("*").eq("order_id",orderId).single();assert.ifError(initial.error);assert.equal(initial.data.additional,false);assert.equal(initial.data.snapshot.items.length,1);
  assert.ifError((await service.from("order_items").insert({order_id:orderId,product_id:product.data.id,quantity:1,unit_price:0,notes:"Extra"})).error);
  const extra=await service.from("print_jobs").select("*").eq("order_id",orderId).eq("additional",true).single();assert.ifError(extra.error);assert.equal(extra.data.snapshot.items.length,1);assert.equal(extra.data.snapshot.items[0].notes,"Extra");
  const receiptRequest={action:"request",request_id:randomUUID(),kind:"receipt",order_id:orderId};
  const receiptA=await post(receiptRequest,cashier),receiptB=await post(receiptRequest,cashier);assert.equal(receiptA.status,200);assert.equal(receiptB.status,200);const receiptId=await receiptA.json();assert.equal(receiptId,await receiptB.json());
  assert.equal((await post({...receiptRequest,request_id:randomUUID()},kitchen)).status,403);
  const kitchenList=await fetch(base+"/api/staff/printing",{headers:kitchen});const kitchenBody=await kitchenList.json();assert.ok(kitchenBody.jobs.every(j=>j.kind!=="receipt" && !("payments"in j.snapshot)));
  assert.equal((await fetch(base+"/print/jobs/"+receiptId,{headers:kitchen})).status,404);
  const request={action:"request",request_id:randomUUID(),job_id:extra.data.id};
  const copies=await Promise.all([post(request,admin),post(request,admin)]);assert.equal(copies[0].status,200);assert.equal(copies[1].status,200);assert.equal(await copies[0].json(),await copies[1].json());
  const preview=await fetch(base+"/print/jobs/"+extra.data.id,{headers:cashier});assert.equal(preview.status,200);assert.ok((await preview.text()).includes("ADICIONAL"));
  const test=await post({action:"request",request_id:randomUUID(),kind:"test",destination:"cashier"},admin);assert.equal(test.status,200);testJob=await test.json();assert.equal(typeof testJob,"string");
  const testPage=await fetch(base+"/print/jobs/"+testJob,{headers:admin});assert.equal(testPage.status,200);assert.ok((await testPage.text()).includes("data:image/png;base64,"));
  const discard={action:"review",job_id:testJob,decision:"discard",request_id:randomUUID()};
  assert.equal((await post(discard,cashier)).status,403);
  assert.equal((await post(discard,admin)).status,200);assert.equal((await post(discard,admin)).status,200);
  const audit=await service.from("print_job_reviews").select("actor_id,decision,created_at").eq("job_id",testJob);assert.equal(audit.data.length,1);assert.equal(audit.data[0].decision,"discard");assert.ok(audit.data[0].actor_id);
  const active=await fetch(base+"/api/staff/printing",{headers:admin});assert.ok(!(await active.json()).jobs.some(j=>j.id===testJob));
  const archived=await fetch(base+"/api/staff/printing?archived=true",{headers:admin});assert.ok((await archived.json()).jobs.some(j=>j.id===testJob&&j.review_decision==="discard"));
  assert.equal((await post({action:"request",request_id:randomUUID(),job_id:testJob},admin)).status,409);
  const ledger=await service.from("print_jobs").select("snapshot").eq("order_id",orderId);assert.ok(ledger.data.every(j=>!("phone"in j.snapshot)&&!("address"in j.snapshot)));
 }finally{
  if(deviceId)assert.ifError((await service.from("print_devices").delete().eq("id",deviceId)).error);
  if(testJob)assert.ifError((await service.from("print_jobs").delete().eq("id",testJob)).error);
  if(orderId)assert.ifError((await service.from("orders").delete().eq("id",orderId)).error);
  for(const client of clients)await client.auth.signOut({scope:"local"});
 }
});
