import assert from "node:assert/strict";
import test from "node:test";
import {cashExpected,denominationTotal,canRevealExpected} from "../src/features/cash-sessions/domain.ts";
import {cashCommandSchema} from "../src/features/cash-sessions/validation.ts";
import {buildPrintDocument} from "../src/features/printing/document.ts";
test("expected cash uses net change and movements, not Pix or the order total",()=>{
 assert.equal(cashExpected(100000,20000,30000,5000),145000);
 assert.equal(cashExpected(0,0,0,1000),-1000);
 assert.throws(()=>cashExpected(0,0.5,0,0));
 assert.equal(denominationTotal([{value:100000,quantity:1},{value:20000,quantity:2},{value:1000,quantity:4}]),144000);
 assert.throws(()=>denominationTotal([{value:1000,quantity:0.5}]));
});
test("blind counting does not reveal expected cash before a count, including zero",()=>{
 assert.equal(canRevealExpected(true,null),false);assert.equal(canRevealExpected(true,0),true);assert.equal(canRevealExpected(false,null),true);
 const id="12345678-1234-4234-8234-123456789abc";
 assert.equal(cashCommandSchema.safeParse({request_id:id,action:"open",payload:{opening_amount:1000}}).success,true);
 assert.equal(cashCommandSchema.safeParse({request_id:id,action:"close",payload:{session_id:id,counted_amount:0,expected_amount:0}}).success,false);
 assert.equal(cashCommandSchema.safeParse({request_id:id,action:"movement",payload:{session_id:id,kind:"withdrawal",amount:1000,reason:" "}}).success,false);
});
test("closure print documents use the shared 58/80 mm engine and keep Pix rounding separate",()=>{
 const report={session:{id:"s",operator_id:"o",business_date:"2026-10-25",opening_amount:100000,revision:1},operator_name:"Cash A",expected:145000,counted:144000,difference:-1000,supply:30000,withdrawal:5000,unpaid:[],payments:{cash_net:20000,total:44000,rounding_adjustment:500,order_count:1,delivery_fees:0,methods:[{method:"cash",currency:"PYG",original:25000,net:20000},{method:"pix",currency:"BRL",original:1750,net:24000}],types:[],cancellations:{count:0,amount:0}}};
 for(const paper_mm of [58,80]){const doc=buildPrintDocument({kind:"cash_session",reprint:false,additional:false,device:{paper_mm,columns:paper_mm===58?32:48,locale:"pt-BR"},snapshot:{cash_report:report}},"http://restaurant.local");assert.equal(doc.paperMm,paper_mm);const text=doc.blocks.filter(b=>b.type==="text").map(b=>b.text).join("\n");assert.ok(text.includes("145.000"));assert.ok(text.includes("-1.000"));assert.ok(text.includes("17,50"));assert.ok(text.includes("separado"));}
});
