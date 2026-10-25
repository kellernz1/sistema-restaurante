import { z } from "zod";
import { normalizeCounterName } from "./domain.ts";
import { paymentRequestSchema } from "../payments/validation.ts";
import { tableOrderSchema } from "../customer-ordering/validation.ts";
import {MAX_MONEY} from "../../lib/money.ts";
const draftAmount=z.number().int().min(0).max(MAX_MONEY).nullable();
export const counterDraftSchema=z.strictObject({name:z.string().max(120),items:tableOrderSchema.shape.items,payments:z.array(z.strictObject({method:z.enum(["cash","transfer","card","pix"]),currency:z.enum(["PYG","BRL"]),allocation:draftAmount,received:draftAmount}).refine(row=>(row.method!=="cash"||row.currency==="PYG")&&(row.method!=="pix"||row.currency==="BRL"))).max(20)});
export const counterRequestSchema = z.strictObject({
  request_id: z.uuid(),
  payload: z.strictObject({ name: z.string().max(200).nullish().transform((value, context) => {
    try { return normalizeCounterName(value ?? ""); } catch { context.addIssue({ code: "custom", message: "Nome deve ter até 30 caracteres." }); return z.NEVER; }
  }), items: tableOrderSchema.shape.items }),
  lines: paymentRequestSchema.shape.lines.or(z.tuple([])),
});
