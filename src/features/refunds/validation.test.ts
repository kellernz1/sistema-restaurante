import {describe,it,expect}from "vitest";
import {refundOperationSchema,refundRequestSchema}from "./validation";
import {MAX_MONEY,money}from "@/lib/money";
const target="11111111-1111-4111-8111-111111111111";
describe("refund input boundaries",()=>{
 it("accepts whole PYG partial amounts and server-calculated cancellation",()=>{
  expect(refundOperationSchema.safeParse({action:"refund",target,amount:40000,reason:"Discounted order"}).success).toBe(true);
  expect(refundOperationSchema.safeParse({action:"cancel_refund",target,reason:"Full cancellation"}).success).toBe(true);
  expect(money.format(40000)).toBe("Gs. 40.000");
 });
 it.each([0,-1,1.5,MAX_MONEY+1,NaN,Infinity])("rejects unsafe partial amount %s",amount=>{
  expect(refundOperationSchema.safeParse({action:"refund",target,amount,reason:"Return"}).success).toBe(false);
 });
 it("does not accept client supplied totals, rates or unconfirmed execution",()=>{
  const operation={action:"cancel_refund",target,reason:"Return"};
  for(const extra of [{total:50000},{rate:1400},{paid:50000}])expect(refundOperationSchema.safeParse({...operation,...extra}).success).toBe(false);
  const execution={command:"execute",request:target,operation,binding:"a".repeat(64),authorization:null};
  expect(refundRequestSchema.safeParse({...execution,confirmed:false}).success).toBe(false);
  expect(refundRequestSchema.safeParse({...execution,confirmed:true,pin:"1234"}).success).toBe(false);
  expect(refundRequestSchema.safeParse({...execution,confirmed:true}).success).toBe(true);
 });
});
