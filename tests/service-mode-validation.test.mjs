import assert from "node:assert/strict";
import test from "node:test";
import {servicePolicySchema} from "../src/features/service-modes/validation.ts";
import {tableOrderSchema} from "../src/features/customer-ordering/validation.ts";
const policy={counter_enabled:true,uses_waiter:false,qr_confirmation:"manual",qr_phone:"optional",pending_per_table:2,pending_per_phone:2};
test("service policy accepts only supported confirmation/phone modes and bounded limits",()=>{
 for(const qr_confirmation of ["manual","after_first","payment"])for(const qr_phone of ["required","optional","off"])assert.ok(servicePolicySchema.safeParse({...policy,qr_confirmation,qr_phone}).success);
 for(const value of [{...policy,pending_per_table:0},{...policy,pending_per_phone:21},{...policy,qr_confirmation:"timer"},{...policy,uses_waiter:"false"},{...policy,extra:true}])assert.equal(servicePolicySchema.safeParse(value).success,false);
});
test("QR requests require name and retry key and reject forged financial values",()=>{
 const id="12345678-1234-4234-8234-123456789abc",request={request_id:id,customer_name:" Ana ",items:[{product_id:id,quantity:1}]};
 assert.equal(tableOrderSchema.parse(request).customer_name,"Ana");
 for(const value of [{...request,request_id:undefined},{...request,customer_name:" "},{...request,total_amount:1},{...request,items:[{product_id:id,quantity:1,unit_price:0}]}])assert.equal(tableOrderSchema.safeParse(value).success,false);
});
