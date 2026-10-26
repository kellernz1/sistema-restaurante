import { describe, expect, it } from "vitest";
import { discountBasisPoints } from "./domain";
import { counterDiscountRequestSchema, counterRequestSchema } from "./validation";
const id="11111111-1111-4111-8111-111111111111";
const payload={name:"Ana",items:[{product_id:id,quantity:2,notes:"Sem cebola"}]};
describe("counter discount boundary",()=>{
 it("parses decimal percentages without floating-point drift",()=>{
  expect(discountBasisPoints("10.12")).toBe(1012);expect(discountBasisPoints("0.01")).toBe(1);expect(discountBasisPoints("100")).toBe(10000);
  for(const value of ["0","100.01","1.001","-1","abc"])expect(()=>discountBasisPoints(value)).toThrow();
 });
 it("accepts only bounded discounts with exact quote binding",()=>{
  const discount={mode:"percent",value:1000,reason:"Cortesia"};
  expect(counterDiscountRequestSchema.safeParse({command:"quote",draft_id:id,payload,discount}).success).toBe(true);
  const authorization={...discount,draft_id:id,binding:"a".repeat(64),authorization:null};
  expect(counterRequestSchema.safeParse({request_id:id,payload:{...payload,discount:authorization},lines:[]}).success).toBe(true);
  for(const value of [0,-1,1.5,10001])expect(counterDiscountRequestSchema.safeParse({command:"quote",draft_id:id,payload,discount:{...discount,value}}).success).toBe(false);
  expect(counterRequestSchema.safeParse({request_id:id,payload:{...payload,discount:{...authorization,total:1}},lines:[]}).success).toBe(false);
  expect(counterRequestSchema.safeParse({request_id:id,payload:{...payload,discount:{mode:"amount",value:1,reason:"Cortesia"}},lines:[]}).success).toBe(false);
 });
});
