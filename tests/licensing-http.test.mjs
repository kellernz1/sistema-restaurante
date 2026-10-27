import "./helpers/integration-guard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID}from "node:crypto";
import {createServerClient}from "@supabase/ssr";
import {fixtureSql}from "./helpers/integration-sql.mjs";
import {assertIntegrationEnvironment}from "./helpers/integration-guard.mjs";
import {licenseFixtures}from "./helpers/license-fixture.mjs";
import {createLicenseServer}from "../owner-tools/licensing/server.mjs";
import {withRegistry}from "../owner-tools/licensing/core.mjs";
import {createBackup}from "../scripts/local/backup.mjs";
import {restoreToTemporary,temporaryDatabase,assertTemporary,sql}from "../scripts/local/restore.mjs";
import {command}from "../scripts/local/operations-process.mjs";
import {licenseErrors}from "../src/features/licensing/validation.ts";
const base=process.env.PUBLIC_TEST_URL,api=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
test("license HTTP import/renewal/restriction preserves settlement, refund, printing and backup/restore",{skip:!(base&&api&&key)},async()=>{
 const clients=[];
 async function login(role){const jar=new Map(),db=createServerClient(api,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(({name,value})=>jar.set(name,value))}});assert.ifError((await db.auth.signInWithPassword({email:role+"@restaurante.local",password:process.env.DEMO_PASSWORD})).error);clients.push(db);return {cookie:[...jar].map(([name,value])=>name+"="+value).join("; "),"content-type":"application/json"};}
 const admin=await login("admin"),cashier=await login("caixa"),kitchen=await login("cozinha");
 const post=(route,body,headers=admin)=>fetch(base+route,{method:"POST",headers,body:JSON.stringify(body)});
 const get=route=>fetch(base+route,{headers:admin});
 const snapshot=JSON.parse(await fixtureSql("select json_build_object('installation',(select row_to_json(i)from public.license_installation i),'current',(select row_to_json(c)from public.license_current c),'timing',(select counter_payment_timing from public.restaurant_settings where id))"));
 const f=licenseFixtures(snapshot.installation.installation_id),directory=fs.mkdtempSync(path.join(os.tmpdir(),"mesa-http-license-")),registryFile=path.join(directory,"registry.json"),owner=assertIntegrationEnvironment(),container=`supabase_db_${owner.project}`,restored=temporaryDatabase("restore");
 const server=createLicenseServer({privateKey:f.pem,registryFile,adminToken:"test-"+"a".repeat(40)});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let closed=false;
 try{
  assert.equal((await fetch(base+"/api/staff/license")).status,401);assert.equal((await fetch(base+"/api/staff/license",{headers:kitchen})).status,403);
  assert.equal((await post("/api/staff/license",{command:"renew"},cashier)).status,403);
  const malformed=await post("/api/staff/license",{command:"import",token:"invalid"});assert.equal(malformed.status,400);assert.equal((await malformed.json()).error,licenseErrors.format);
  await fixtureSql("update public.license_installation set public_key=null;");
  const missingKey=await post("/api/staff/license",{command:"import",token:f.tokens.active});assert.equal(missingKey.status,409);assert.equal((await missingKey.json()).error,licenseErrors.missingKey);
  // Privileged setup touches only this owned temporary licensing cache, never production or financial history.
  await fixtureSql(`update public.license_installation set public_key=decode('${f.key}','hex'),max_sequence=0,max_seen_at=clock_timestamp(),clock_suspect=false,clock_deadline=null,clock_ack_until=null,restricted=false;delete from public.license_current;`);
  assert.equal((await post("/api/staff/license",{command:"import",token:f.tokens.active})).status,200);
  const foreign=await post("/api/staff/license",{command:"import",token:f.tokens.wrong_installation});assert.equal(foreign.status,400);assert.equal((await foreign.json()).error,licenseErrors.installation);
  const tampered=await post("/api/staff/license",{command:"import",token:"A"+f.tokens.active.slice(1)});assert.equal(tampered.status,400);assert.equal((await tampered.json()).error,licenseErrors.signature);
  assert.equal((await post("/api/staff/license",{command:"configure",url:`http://127.0.0.1:${server.address().port}/v1/renew`,days:7})).status,200);
  withRegistry(registryFile,r=>{r.installations[f.base.installation_id]={license_id:f.base.license_id,restaurant:"HTTP test",plan:"pilot",features:["delivery","whatsapp"],sequence:1,history:[],grace_days:7,paid_until:new Date(Date.now()+30*86400000).toISOString(),suspended:false};});
  await fixtureSql("update public.license_installation set max_seen_at=clock_timestamp()+interval '3 hours';");
  const clock=await(await get("/api/staff/license")).json();assert.equal(clock.requires_online,true);assert.equal(clock.orders_enabled,true);
  const renewed=await post("/api/staff/license",{command:"renew"});assert.equal(renewed.status,200,await renewed.clone().text());const state=await renewed.json();assert.ok(state.last_online_at);assert.equal(state.requires_online,false);
  const older=await post("/api/staff/license",{command:"import",token:f.tokens.active});assert.equal(older.status,400);assert.equal((await older.json()).error,licenseErrors.older);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));closed=true;
  assert.equal((await post("/api/staff/license",{command:"renew"})).status,503);
  const unchanged=await(await get("/api/staff/license")).json();assert.equal(unchanged.sequence,state.sequence);assert.equal(unchanged.last_online_at,state.last_online_at);
  const basic=f.token(7,30,{issued_at:new Date().toISOString(),plan:"basic",features:[]});assert.equal((await post("/api/staff/license",{command:"import",token:basic})).status,200);
  assert.equal((await post("/api/public/delivery-quote",{location_url:"https://www.google.com/maps/search/?api=1&query=-25.301,-57.601"})).status,503);
  const whatsapp=await post("/api/whatsapp/simulate",{phone:"+595981123457",text:"menu",message_id:"license:"+randomUUID()},{"content-type":"application/json",authorization:"Bearer "+process.env.WHATSAPP_WORKER_SECRET});assert.equal(whatsapp.status,200);assert.ok((await whatsapp.json()).replies.some(r=>r.payload.body.includes("temporariamente")));
  const sessions=await(await get("/api/staff/cash-sessions")).json();if(!sessions.current)assert.equal((await post("/api/staff/cash-sessions",{request_id:randomUUID(),action:"open",payload:{opening_amount:10000}})).status,200);
  await fixtureSql("update public.restaurant_settings set counter_payment_timing='at_end'where id;");
  const menu=await(await fetch(base+"/api/public/menu")).json(),product=menu.products.find(p=>p.price>0);
  const creation=await post("/api/staff/counter",{request_id:randomUUID(),payload:{name:"Existing licensed order",items:[{product_id:product.id,quantity:1}]},lines:[]});assert.equal(creation.status,201,await creation.clone().text());const order=(await creation.json()).order;
  await fixtureSql("update public.license_installation set max_seen_at=clock_timestamp()+interval '40 days';");
  assert.equal((await(await get("/api/staff/license")).json()).state,"restricted");
  const blocked=await post("/api/public/orders",{order_type:"pickup",customer_name:"Blocked sale",customer_phone:"+595981123456",payment_method:"cash",items:[{product_id:product.id,quantity:1}]});assert.equal(blocked.status,503,await blocked.clone().text());assert.match((await blocked.json()).error,/temporariamente/);
  const publicMenu=await(await fetch(base+"/api/public/menu")).json();assert.equal(publicMenu.settings.is_accepting_orders,false);assert.equal(publicMenu.settings.delivery_enabled,false);assert.equal(JSON.stringify(publicMenu).includes(f.base.installation_id),false);
  const paid=await post(`/api/staff/orders/${order.id}/payments`,{request_id:randomUUID(),lines:[{method:"cash",currency:"PYG",amount_pyg:order.total_amount,original_amount:order.total_amount}]});assert.equal(paid.status,200,await paid.clone().text());
  const operation={action:"cancel_refund",target:order.id,reason:"Existing restricted order refund"};const quote=await(await post("/api/staff/refunds",{command:"quote",operation})).json();
  assert.equal((await post("/api/staff/refunds",{command:"execute",request:randomUUID(),operation,binding:quote.binding,authorization:null,confirmed:true})).status,200);
  assert.equal((await get("/admin/reports")).status,200);assert.equal((await get(`/print/counter/${order.id}`)).status,200);
  const backup=await createBackup({database:"postgres",container,directory:path.join(process.env.INTEGRATION_RUN_DIR,"restricted-backups"),record:false,reason:"restricted-license-acceptance"});
  await restoreToTemporary(backup,{container,database:restored});
  assert.equal(JSON.parse(await sql(container,restored,"select public.license_snapshot()" )).state,"restricted");
  assert.ok(Number(await sql(container,restored,"select count(*)from public.orders"))>0);
 }finally{
  assertTemporary(restored);await command("docker",["exec",container,"dropdb","-U","postgres","--if-exists",restored]);
  if(!closed){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  const literal=value=>JSON.stringify(value).replaceAll("'","''"),fields=Object.keys(snapshot.installation).map(k=>`"${k}"`).join(",");
  await fixtureSql(`update public.license_installation set(${fields})=(select ${fields}from jsonb_populate_record(null::public.license_installation,'${literal(snapshot.installation)}'::jsonb));delete from public.license_current;insert into public.license_current select *from jsonb_populate_record(null::public.license_current,'${literal(snapshot.current)}'::jsonb);update public.restaurant_settings set counter_payment_timing='${snapshot.timing}'where id;`);
  await Promise.all(clients.map(c=>c.auth.signOut({scope:"local"})));fs.rmSync(directory,{recursive:true,force:true});
 }
});
