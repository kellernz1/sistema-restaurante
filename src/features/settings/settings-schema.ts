import { z } from "zod";

export const settingsSchema = z.strictObject({
  is_accepting_orders: z.boolean(), dine_in_qr_enabled: z.boolean(), require_confirmation_for_qr: z.boolean(),
  pickup_enabled: z.boolean(), delivery_enabled: z.boolean(), whatsapp_enabled: z.boolean(),
  delivery_fee: z.number().finite().min(0).max(999999.99).multipleOf(0.01), min_delivery_order: z.number().finite().min(0).max(999999.99).multipleOf(0.01),
  estimated_pickup_minutes: z.number().int().min(1).max(1440), estimated_delivery_minutes: z.number().int().min(1).max(1440),
});
