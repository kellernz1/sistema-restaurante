import { z } from "zod";
import { normalizeCounterName } from "./domain.ts";
import { paymentRequestSchema } from "../payments/validation.ts";
import { tableOrderSchema } from "../customer-ordering/validation.ts";
export const counterRequestSchema = z.strictObject({
  request_id: z.uuid(),
  payload: z.strictObject({ name: z.string().max(200).nullish().transform((value, context) => {
    try { return normalizeCounterName(value ?? ""); } catch { context.addIssue({ code: "custom", message: "Nome deve ter até 30 caracteres." }); return z.NEVER; }
  }), items: tableOrderSchema.shape.items }),
  lines: paymentRequestSchema.shape.lines.or(z.tuple([])),
});
