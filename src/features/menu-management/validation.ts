import { MAX_MONEY } from "../../lib/money.ts";
import { z } from "zod";

export const productSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable(),
  category_id: z.uuid(),
  price: z.number().int().min(0).max(MAX_MONEY),
  is_active: z.boolean(),
});
export const productPatchSchema = z.union([
  productSchema.partial().refine((value) => Object.keys(value).length > 0),
  z.strictObject({ action: z.literal("restore") }),
]);
