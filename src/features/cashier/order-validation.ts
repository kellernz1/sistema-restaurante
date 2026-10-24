import { z } from "zod";

import { offsiteOrderSchema } from "@/features/customer-ordering/offsite-validation";
import { tableOrderSchema } from "@/features/customer-ordering/validation";

export const cashierOrderPayloadSchema = z.union([
  z.strictObject({
    order_type: z.literal("dine_in"), table_id: z.uuid(),
    items: tableOrderSchema.shape.items,
    notes: z.string().trim().max(500).optional(),
  }),
  offsiteOrderSchema,
]);

export const cashierOrderSchema = z.strictObject({
  request_id: z.uuid(), payload: cashierOrderPayloadSchema,
});
