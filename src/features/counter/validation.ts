import { z } from "zod";
import { normalizeCounterName } from "./domain.ts";
import { paymentRequestSchema } from "../payments/validation.ts";
import { tableOrderSchema } from "../customer-ordering/validation.ts";
import {MAX_MONEY} from "../../lib/money.ts";
const draftAmount=z.number().int().min(0).max(MAX_MONEY).nullable();
export const counterDiscountSchema=z.strictObject({mode:z.enum(["amount","percent"]),value:z.number().int().min(1).max(MAX_MONEY),reason:z.string().trim().min(2).max(300)}).refine(d=>d.mode!=="percent"||d.value<=10000);
export const counterDiscountAuthorizationSchema=counterDiscountSchema.safeExtend({draft_id:z.uuid(),binding:z.string().regex(/^[a-f0-9]{64}$/),authorization:z.uuid().nullable()});
export const counterDraftSchema=z.strictObject({name:z.string().max(120),items:tableOrderSchema.shape.items,payments:z.array(z.strictObject({method:z.enum(["cash","transfer","card","pix"]),currency:z.enum(["PYG","BRL"]),allocation:draftAmount,received:draftAmount}).refine(row=>(row.method!=="cash"||row.currency==="PYG")&&(row.method!=="pix"||row.currency==="BRL"))).max(20)});
export const counterRequestSchema = z.strictObject({
  request_id: z.uuid(),
  payload: z.strictObject({ name: z.string().max(200).nullish().transform((value, context) => {
    try { return normalizeCounterName(value ?? ""); } catch { context.addIssue({ code: "custom", message: "Nome deve ter até 30 caracteres." }); return z.NEVER; }
  }), items: tableOrderSchema.shape.items, discount:counterDiscountAuthorizationSchema.optional() }),
  lines: paymentRequestSchema.shape.lines.or(z.tuple([])),
});
export const counterDiscountRequestSchema=z.discriminatedUnion("command",[
 z.strictObject({command:z.literal("quote"),draft_id:z.uuid(),payload:counterRequestSchema.shape.payload.omit({discount:true}),discount:counterDiscountSchema}),
 z.strictObject({command:z.literal("approve"),request_id:z.uuid(),draft_id:z.uuid(),payload:counterRequestSchema.shape.payload.omit({discount:true}),discount:counterDiscountSchema,binding:z.string().regex(/^[a-f0-9]{64}$/),approver:z.uuid(),pin:z.string().regex(/^\d{4,6}$/)})
]);
