import { MAX_MONEY } from "../../lib/money.ts";
import { z } from "zod";

export const settingsSchema = z.strictObject({
  restaurant_name:z.string().trim().min(1).max(80),
  business_timezone:z.string().min(1).max(64), business_day_start:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/),
  counter_payment_timing:z.enum(["at_order","at_end"]), counter_green_minutes:z.number().int().min(0).max(120),counter_yellow_minutes:z.number().int().min(0).max(1440),
  default_phone_country: z.enum(["PY", "BR"]),
  is_accepting_orders: z.boolean(), dine_in_qr_enabled: z.boolean(), require_confirmation_for_qr: z.boolean(),
  pickup_enabled: z.boolean(), delivery_enabled: z.boolean(), whatsapp_enabled: z.boolean(),
  kitchen_auto_print_enabled: z.boolean(),
  delivery_fee: z.number().int().min(0).max(MAX_MONEY), min_delivery_order: z.number().int().min(0).max(MAX_MONEY),
  estimated_pickup_minutes: z.number().int().min(1).max(1440), estimated_delivery_minutes: z.number().int().min(1).max(1440),
  delivery_fee_mode: z.enum(["fixed", "distance"]),
  delivery_distance_step_km: z.number().finite().min(0.1).max(100).multipleOf(0.01),
  delivery_distance_step_fee: z.number().int().min(0).max(MAX_MONEY),
  delivery_origin_latitude: z.number().finite().min(-90).max(90).nullable(),
  delivery_origin_longitude: z.number().finite().min(-180).max(180).nullable(),
}).refine((value) => value.counter_yellow_minutes >= value.counter_green_minutes,{message:"Confira os limites de espera."}).refine((value) => value.delivery_fee_mode !== "distance" || (value.delivery_origin_latitude !== null && value.delivery_origin_longitude !== null), { message: "Informe a localização do restaurante." });
