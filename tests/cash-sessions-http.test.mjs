import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createServerClient} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";
const base=process.env.PUBLIC_TEST_URL,api=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
test("cash HTTP reports enforce role boundaries and daily totals include legacy unassigned receipts",{skip:!(base&&api&&key&&secret)},async()=>{
 const clients=[];
 async function login(role){const jar=new Map();const db=createServerClient(api,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:role+"@restaurante.local",password:process.env.DEMO_PASSWORD||"Demo@12345"})).error);clients.push(db);return {cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),"content-type":"application/json"};}
 try{
  const admin=await login("admin"),cashier=await login("caixa"),kitchen=await login("cozinha"),waiter=await login("garcom");
  assert.equal((await fetch(base+"/api/staff/cash-sessions")).status,401);
  for(const headers of [kitchen,waiter]){assert.equal((await fetch(base+"/api/staff/cash-sessions",{headers})).status,403);assert.equal((await fetch(base+"/api/staff/cash-reports",{headers})).status,403);}
  const own=await fetch(base+"/api/staff/cash-sessions",{headers:cashier});assert.equal(own.status,200);const ownData=await own.json();assert.ok(ownData.sessions.every(s=>s.operator_id===ownData.user_id));assert.equal(typeof ownData.policy.blind_count,"boolean");
  assert.equal((await fetch(base+"/api/staff/cash-sessions",{method:"PATCH",headers:admin,body:JSON.stringify(ownData.policy)})).status,200);
  assert.equal((await fetch(base+"/api/staff/cash-reports",{headers:cashier})).status,403);
  assert.equal((await fetch(base+"/api/staff/cash-sessions",{method:"PATCH",headers:cashier,body:JSON.stringify({require_open_session:false,blind_count:false})})).status,403);
  assert.equal((await fetch(base+"/api/staff/cash-sessions",{method:"POST",headers:cashier,body:JSON.stringify({request_id:randomUUID(),action:"open",payload:{opening_amount:0.5}})})).status,400);
  const daily=await fetch(base+"/api/staff/cash-reports",{headers:admin});assert.equal(daily.status,200);const report=await daily.json();assert.match(report.day,/^\d{4}-\d{2}-\d{2}$/);assert.ok(Number.isSafeInteger(report.payments.total));assert.ok(Array.isArray(report.products));assert.ok(Array.isArray(report.sessions));
  const service=createClient(api,secret,{auth:{persistSession:false,autoRefreshToken:false}});const payment=await service.from("payments").select("equivalent_pyg,change_pyg,business_date,created_at,cash_session_id");assert.ifError(payment.error);
  // SQL supplies today's exact commercial window, including legacy rows without a saved date.
  const window=await clients[0].rpc("business_day_window",{});assert.ifError(window.error);
  const rows=payment.data.filter(p=>p.business_date?p.business_date===report.day:Date.parse(p.created_at)>=Date.parse(window.data.start)&&Date.parse(p.created_at)<Date.parse(window.data.end));
  // Block 8B recognizes returns on their own business date without rewriting receipts.
  const refunds=await clients[0].from("refunds").select("amount_pyg,business_date");assert.ifError(refunds.error);
  const returned=refunds.data.filter(r=>r.business_date===report.day).reduce((sum,r)=>sum+r.amount_pyg,0);
  assert.equal(report.payments.total,rows.reduce((sum,p)=>sum+p.equivalent_pyg-p.change_pyg,0)-returned);
  assert.equal(report.payments.refunds.amount,returned);
  assert.equal((await fetch(base+"/api/staff/cash-reports?day=bad",{headers:admin})).status,400);
  assert.equal((await fetch(base+"/admin/reports",{headers:admin})).status,200);
  assert.equal((await fetch(base+"/cashier/sessions",{headers:cashier})).status,200);
  assert.equal((await fetch(base+`/api/staff/cash-sessions/${randomUUID()}/print`,{method:"POST",headers:kitchen,body:JSON.stringify({request_id:randomUUID()})})).status,403);
 }finally{for(const client of clients)await client.auth.signOut({scope:"local"});}
});
