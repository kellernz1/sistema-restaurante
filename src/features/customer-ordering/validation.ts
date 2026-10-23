import { z } from "zod";

export const tableTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const tableOrderSchema = z.strictObject({
  source: z.enum(["qr", "nfc"]).default("qr"),
  customer_name: z.string().trim().max(80).optional(),
  items: z.array(z.strictObject({
    product_id: z.uuid(),
    quantity: z.number().int().min(1).max(99),
    notes: z.string().trim().max(500).optional(),
  })).min(1).max(50),
});
export const serviceRequestSchema = z.strictObject({ type: z.enum(["waiter", "bill"]) });
export type TableOrderInput = z.infer<typeof tableOrderSchema>;
