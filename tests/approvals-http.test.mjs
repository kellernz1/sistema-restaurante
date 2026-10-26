import "./helpers/integration-guard.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {createServerClient} from "@supabase/ssr";
import {randomUUID} from "node:crypto";
const base=process.env.PUBLIC_TEST_URL,api=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
test("approval endpoints enforce staff permissions without changing financial data",{skip:!(base&&api&&key)},async()=>{
 for(const route of ["approvals","approval-orders","audit","kitchen-cancellations","refunds"]){assert.equal((await fetch(`${base}/api/staff/${route}`)).status,401);}
 const clients=[];
 async function login(role){const jar=new Map();const db=createServerClient(api,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:role+"@restaurante.local",password:process.env.DEMO_PASSWORD||"Demo@12345"})).error);clients.push(db);return {cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),"content-type":"application/json"};}
 try{
  const cashier=await login("caixa"),kitchen=await login("cozinha"),admin=await login("admin");
  for(const headers of [cashier,admin]){
   assert.equal((await fetch(base+"/api/staff/refunds?order="+randomUUID(),{headers})).status,200);
   assert.equal((await fetch(base+"/api/staff/refunds",{method:"POST",headers,body:JSON.stringify({command:"execute",request:randomUUID(),operation:{action:"cancel_refund",target:randomUUID(),reason:"HTTP negative refund"},binding:"a".repeat(64),authorization:null,confirmed:false})})).status,400);
   assert.equal((await fetch(base+"/api/staff/refunds",{method:"POST",headers,body:JSON.stringify({command:"quote",operation:{action:"refund",target:randomUUID(),amount:1.5,reason:"HTTP invalid amount"}})})).status,400);
   assert.equal((await fetch(base+"/api/staff/refunds",{method:"POST",headers,body:JSON.stringify({command:"quote",operation:{action:"cancel_refund",target:randomUUID(),reason:"HTTP missing order"}})})).status,409);
  }
  assert.equal((await fetch(base+"/api/staff/refunds?order="+randomUUID(),{headers:kitchen})).status,403);
  assert.equal((await fetch(base+"/api/staff/refunds",{method:"POST",headers:kitchen,body:"{}"})).status,403);
  assert.equal((await fetch(base+"/api/staff/approvals",{headers:kitchen})).status,403);
  assert.equal((await fetch(base+"/api/staff/audit",{headers:cashier})).status,403);
  assert.equal((await fetch(base+"/api/staff/security",{method:"PATCH",headers:cashier,body:"{}"})).status,403);
  assert.equal((await fetch(base+"/api/staff/approvals",{method:"POST",headers:cashier,body:JSON.stringify({command:"pin",pin:"abcd",password:"invalid"})})).status,400);
  assert.equal((await fetch(base+"/api/staff/approvals",{headers:cashier})).status,200);
  assert.equal((await fetch(base+"/api/staff/counter/discount",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).status,401);
  assert.equal((await fetch(base+"/api/staff/counter/discount",{method:"POST",headers:kitchen,body:"{}"})).status,403);
  const product=await clients[0].from("products").select("id,price").eq("is_active",true).gt("price",1).limit(1).single();assert.ifError(product.error);
  const draft_id=randomUUID(),payload={name:"HTTP discount",items:[{product_id:product.data.id,quantity:1}]},discount={mode:"amount",value:1,reason:"HTTP quote test"};
  const quoteResponse=await fetch(base+"/api/staff/counter/discount",{method:"POST",headers:cashier,body:JSON.stringify({command:"quote",draft_id,payload,discount})});assert.equal(quoteResponse.status,200);const counterQuote=await quoteResponse.json();assert.equal(counterQuote.gross,product.data.price);assert.equal(counterQuote.total,product.data.price-1);
  assert.equal((await fetch(base+"/api/staff/counter/discount",{method:"POST",headers:cashier,body:JSON.stringify({command:"quote",draft_id,payload:{...payload,total:1},discount})})).status,400);
  assert.equal((await fetch(base+"/api/staff/counter",{method:"POST",headers:cashier,body:JSON.stringify({request_id:randomUUID(),payload:{...payload,discount:{...discount,draft_id,binding:"a".repeat(64),authorization:null}},lines:[]})})).status,409);
  const operation={action:"discount",target:randomUUID(),mode:"amount",value:1,reason:"HTTP boundary test"};
  assert.equal((await fetch(base+"/api/staff/approvals",{method:"POST",headers:cashier,body:JSON.stringify({command:"execute",request:randomUUID(),operation,binding:"a".repeat(64),authorization:randomUUID()})})).status,409);
  assert.equal((await fetch(base+"/api/staff/approvals",{method:"POST",headers:cashier,body:JSON.stringify({command:"quote",operation:{...operation,total:0}})})).status,400);
  const audit=await fetch(base+"/api/staff/audit",{headers:admin});assert.equal(audit.status,200);const result=await audit.json();assert.ok(Array.isArray(result.events));
  assert.ok(result.events.every(e=>!("pin" in e)&&!("pin_hash" in e)&&!("authorization" in e)));
 }finally{await Promise.all(clients.map(c=>c.auth.signOut({scope:"local"})));}
});
