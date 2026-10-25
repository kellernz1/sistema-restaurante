import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {withPrintDeadline,printRpc} from "../scripts/printing-deadline.mjs";
import {processOnePrint} from "../scripts/printing-process.mjs";
import {loadPrintRequest,savePrintRequest,clearPrintRequest} from "../src/features/printing/pending-request.ts";

test("RPC deadlines abort a request that never completes",async()=>{
 let aborted=false;
 const db={rpc(){return {abortSignal(signal){signal.addEventListener("abort",()=>{aborted=true;});return new Promise(()=>{});}};}};
 await assert.rejects(printRpc(db,"test",{},10),{name:"TimeoutError"});
 assert.equal(aborted,true);
 assert.equal(await withPrintDeadline(async()=>42,100),42);
});
test("a stalled driver becomes uncertain without automatic resend, then later calls can reconnect",async()=>{
 let state="pending",deliveries=0,offline=true;
 const device={id:randomUUID(),name:"Test",driver:"file",paper_mm:80,columns:48,codepage:"cp860",codepage_number:3,locale:"pt-BR"};
 const job={id:randomUUID(),claim_token:randomUUID(),kind:"test",device,snapshot:{},reprint:false,additional:false};
 const db={async rpc(name,args){if(offline)return {error:new Error("Database unavailable")};if(name==="claim_print_job"){if(state!=="pending")return {data:null};state="processing";return {data:job};}state=args.p_status;return {data:null};}};
 const context={db,owner:randomUUID(),driver:{deliver(){deliveries++;return new Promise(()=>{});}},appUrl:"http://restaurant.local",driverTimeout:10};
 await assert.rejects(processOnePrint(context));
 offline=false;assert.equal(await processOnePrint(context),"uncertain");assert.equal(state,"uncertain");
 assert.equal(await processOnePrint(context),null);assert.equal(deliveries,1);
});
test("print request survives a reload with the exact UUID and target until acknowledgement",()=>{
 const map=new Map();const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
 const request={action:"request",request_id:randomUUID(),kind:"receipt",destination:"cashier",order_id:randomUUID()};
 savePrintRequest(storage,request);
 const reloaded=loadPrintRequest(storage,{kind:"receipt",destination:"cashier",order_id:request.order_id});
 assert.deepEqual(reloaded,request);
 assert.equal(loadPrintRequest(storage,{kind:"receipt",destination:"cashier",order_id:randomUUID()}),null);
 clearPrintRequest(storage,reloaded);assert.equal(loadPrintRequest(storage,request),null);
 const denied={...storage,setItem(){throw new Error("Storage disabled");}};
 assert.throws(()=>savePrintRequest(denied,request));
});
