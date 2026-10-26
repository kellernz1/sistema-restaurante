import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createServerClient} from "@supabase/ssr";
import {createClient} from "@supabase/supabase-js";
const base=process.env.PUBLIC_TEST_URL,api=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
test("public QR HTTP cannot bypass required identity, disabled modes, tokens or staff permissions",{skip:!(base&&api&&key&&secret)},async()=>{
 const service=createClient(api,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const clients=[];
 async function login(role){const jar=new Map();const db=createServerClient(api,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:role+"@restaurante.local",password:process.env.DEMO_PASSWORD||"Demo@12345"})).error);clients.push(db);return {cookie:[...jar].map(([k,v])=>k+"="+v).join("; "),"content-type":"application/json"};}
 const policy=await service.from("service_policy").select("*").single(),settings=await service.from("restaurant_settings").select("dine_in_qr_enabled,is_accepting_orders").single();assert.ifError(policy.error);assert.ifError(settings.error);
 try{
 const admin=await login("admin"),cashier=await login("caixa"),kitchen=await login("cozinha"),waiter=await login("garcom");
 for(const headers of [kitchen,waiter])assert.equal((await fetch(base+"/api/staff/qr-requests",{headers})).status,403);
 assert.equal((await fetch(base+"/api/staff/qr-requests")).status,401);
 assert.equal((await fetch(base+"/api/staff/service-modes",{method:"PATCH",headers:cashier,body:"{}"})).status,403);
 assert.equal((await fetch(base+"/api/staff/service-modes",{method:"PATCH",headers:admin,body:"{}"})).status,400);
 assert.ifError((await service.from("restaurant_settings").update({dine_in_qr_enabled:true,is_accepting_orders:true}).eq("id",true)).error);
 assert.ifError((await service.from("service_policy").update({qr_phone:"required",qr_confirmation:"manual"}).eq("id",true)).error);
 const table=await service.from("tables").select("id,qr_token").neq("status","closing").limit(1).single(),product=await service.from("products").select("id").eq("is_active",true).limit(1).single();assert.ifError(table.error);assert.ifError(product.error);
 const url=base+"/api/public/tables/"+table.data.qr_token;
 const post=body=>fetch(url+"/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
 const payload={request_id:randomUUID(),source:"qr",customer_name:"[DEMO] QR validation",items:[{product_id:product.data.id,quantity:1}]};
 assert.equal((await post({...payload,total_amount:1})).status,400);
 assert.equal((await post(payload)).status,409,"Missing required phone must not create a request");
 assert.equal((await post({...payload,customer_phone:"letters"})).status,409);
 assert.equal((await fetch(url+"/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:randomUUID(),access_token:"0".repeat(64),reason:"Test"})})).status,409);
 assert.equal((await fetch(url+"/status?order="+randomUUID()+"&access="+"0".repeat(64))).status,404);
 assert.ifError((await service.from("restaurant_settings").update({dine_in_qr_enabled:false}).eq("id",true)).error);
 assert.equal((await fetch(url)).status,403);assert.equal((await post(payload)).status,403);
 assert.equal((await fetch(base+"/api/public/tables/"+"0".repeat(64))).status,404);
 const created=await service.from("qr_requests").select("id").eq("request_id",payload.request_id);assert.ifError(created.error);assert.equal(created.data.length,0);
 }finally{const {id,...fields}=policy.data;void id;assert.ifError((await service.from("service_policy").update(fields).eq("id",true)).error);assert.ifError((await service.from("restaurant_settings").update(settings.data).eq("id",true)).error);for(const db of clients)await db.auth.signOut({scope:"local"});}
});
