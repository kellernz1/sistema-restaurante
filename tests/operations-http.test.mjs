import assert from "node:assert/strict";
import test from "node:test";
import {createServerClient} from "@supabase/ssr";
const base=process.env.PUBLIC_TEST_URL,api=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
test("operations status and configuration enforce server-side roles without financial writes",{skip:!(base&&api&&key)},async()=>{
 const clients=[];
 async function login(role){const jar=new Map();const db=createServerClient(api,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:`${role}@restaurante.local`,password:process.env.DEMO_PASSWORD||"Demo@12345"})).error);clients.push(db);return {cookie:[...jar].map(([k,v])=>`${k}=${v}`).join("; "),"content-type":"application/json"};}
 try{
  assert.equal((await fetch(base+"/api/staff/operations")).status,401);
  for(const role of ["cozinha","garcom"]){const headers=await login(role);assert.equal((await fetch(base+"/api/staff/operations",{headers})).status,403);}
  const cashier=await login("caixa"),admin=await login("admin");
  const status=await fetch(base+"/api/staff/operations",{headers:cashier});assert.equal(status.status,200);const body=await status.json();assert.equal(body.policy.external_directory,"");assert.equal(body.state.file,undefined);
  assert.equal((await fetch(base+"/api/staff/operations",{method:"PATCH",headers:cashier,body:"{}"})).status,403);
  assert.equal((await fetch(base+"/api/staff/operations",{method:"PATCH",headers:admin,body:JSON.stringify({interval_hours:0})})).status,400);
  assert.equal((await fetch(base+"/api/staff/operations",{headers:admin})).status,200);
 }finally{for(const client of clients)await client.auth.signOut({scope:"local"});}
});
