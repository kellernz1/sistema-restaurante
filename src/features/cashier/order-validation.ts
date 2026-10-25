import { z } from "zod";

import { makeOffsiteOrderSchema } from "@/features/customer-ordering/offsite-validation";
import { tableOrderSchema } from "@/features/customer-ordering/validation";

import type { PhoneCountry } from "@/lib/phone";
export function makeCashierOrderSchema(country: PhoneCountry = "PY") {
 const payloadSchema = z.union([
  z.strictObject({
    order_type: z.literal("dine_in"), table_id: z.uuid(),
    items: tableOrderSchema.shape.items,
    notes: z.string().trim().max(500).optional(),
  }),
  makeOffsiteOrderSchema(country),
]);

return z.strictObject({
  request_id: z.uuid(), payload: payloadSchema,
});

}
export const cashierOrderSchema=makeCashierOrderSchema();
