import { z } from "zod";

import { tableOrderSchema } from "./validation.ts";
import { mapLinkSchema } from "./delivery-location.ts";

export function normalizePhone(value: string) {
  const cleaned = value.replace(/[\s().-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (/^\d{10,11}$/.test(cleaned)) return `+55${cleaned}`;
  if (/^55\d{10,11}$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

export const phoneSchema = z.string().max(30).transform(normalizePhone).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/));
export const addressSchema = z.strictObject({
  street: z.string().trim().min(2).max(120), number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(100).default(""), neighborhood: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.enum(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]),
  zip_code: z.string().transform((value) => value.replace(/[-.\s]/g, "")).pipe(z.string().regex(/^\d{8}$/)),
  reference: z.string().trim().max(200).default(""),
  location_url: mapLinkSchema.optional(),
  delivery_quote_id: z.uuid().optional(),
});

// A map point can be used by itself; any written delivery details are optional.
const locatedAddressSchema = addressSchema.extend({
  street: z.string().trim().max(120).default(""),
  number: z.string().trim().max(20).default(""),
  neighborhood: z.string().trim().max(80).default(""),
  city: z.string().trim().max(80).default(""),
  state: z.union([addressSchema.shape.state, z.literal("")]).default(""),
  zip_code: z.string().transform((value) => value.replace(/[-.\s]/g, "")).pipe(z.string().regex(/^(?:\d{8})?$/)).default(""),
  location_url: mapLinkSchema,
});
export const deliveryAddressSchema = z.union([addressSchema, locatedAddressSchema]);

const fields = {
  items: tableOrderSchema.shape.items,
  customer_name: z.string().trim().min(2).max(80), customer_phone: phoneSchema,
  notes: z.string().trim().max(500).optional(), payment_method: z.enum(["cash", "card", "pix"]),
  cash_change_for: z.number().finite().min(0).max(999999.99).multipleOf(0.01).optional(),
};
export const offsiteOrderSchema = z.discriminatedUnion("order_type", [
  z.strictObject({ ...fields, order_type: z.literal("pickup") }),
  z.strictObject({ ...fields, order_type: z.literal("delivery"), delivery_address: deliveryAddressSchema }),
]).refine((value) => value.cash_change_for === undefined || value.payment_method === "cash", { message: "Troco exige pagamento em dinheiro." });

export const orderActionSchema = z.strictObject({
  action: z.enum(["accept", "reject", "ready", "dispatch", "complete"]),
  reason: z.string().trim().min(1).max(300).optional(),
  payment_method: z.enum(["cash", "card", "pix"]).optional(),
}).refine((value) => value.action !== "reject" || !!value.reason, { message: "Informe o motivo da recusa." })
  .refine((value) => value.action !== "complete" || !!value.payment_method, { message: "Informe o pagamento." });

export type CustomerAddress = z.infer<typeof addressSchema>;
