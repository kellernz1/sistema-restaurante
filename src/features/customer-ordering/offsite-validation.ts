import { MAX_MONEY } from "../../lib/money.ts";
import { z } from "zod";

import { tableOrderSchema } from "./validation.ts";
import { mapLinkSchema } from "./delivery-location.ts";

import { normalizePhone, type PhoneCountry } from "../../lib/phone.ts";
export { normalizePhone } from "../../lib/phone.ts";
export function makePhoneSchema(country: PhoneCountry = "PY") {
 return z.string().max(40).transform((value,ctx) => { try { return normalizePhone(value,country); } catch { ctx.addIssue({code:"custom",message:"Telefone inválido."}); return z.NEVER; } });
}
export const phoneSchema = makePhoneSchema();
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((value) => value || null);
export const addressSchema = z.strictObject({
 street: z.string().trim().min(2).max(120), number: optionalText(40),
 complement: optionalText(100), neighborhood: optionalText(80), city: optionalText(80),
 state: optionalText(80), zip_code: optionalText(20), reference: optionalText(200),
 location_url: mapLinkSchema.optional(), delivery_quote_id:z.uuid().optional(),
});
const locatedAddressSchema=addressSchema.extend({street:optionalText(120),location_url:mapLinkSchema});
export const deliveryAddressSchema=z.union([addressSchema,locatedAddressSchema]);

const fields = {
  items: tableOrderSchema.shape.items,
  customer_name: z.string().trim().min(2).max(80), customer_phone: phoneSchema,
  notes: z.string().trim().max(500).optional(), payment_method: z.enum(["cash", "transfer", "card", "pix"]),
  cash_change_for: z.number().int().min(0).max(MAX_MONEY).optional(),
};
export function makeOffsiteOrderSchema(defaultCountry: PhoneCountry = "PY") {
 return z.discriminatedUnion("order_type", [
  z.strictObject({ ...fields, customer_phone: z.string().max(40), phone_country:z.enum(["PY","BR"]).optional(), order_type: z.literal("pickup") }),
  z.strictObject({ ...fields, customer_phone: z.string().max(40), phone_country:z.enum(["PY","BR"]).optional(), order_type: z.literal("delivery"), delivery_address: deliveryAddressSchema }),
]).refine((value) => value.cash_change_for === undefined || value.payment_method === "cash", { message: "Troco exige pagamento em dinheiro." }).transform((value,ctx) => {
 const parsed=makePhoneSchema(value.phone_country ?? defaultCountry).safeParse(value.customer_phone);
 if(!parsed.success){ctx.addIssue({code:"custom",message:"Telefone inválido."});return z.NEVER;}
 const {phone_country,...result}=value;void phone_country;return {...result,customer_phone:parsed.data};
 });
}
export const offsiteOrderSchema=makeOffsiteOrderSchema();

export const orderActionSchema = z.strictObject({
  action: z.enum(["accept", "reject", "ready", "dispatch", "complete"]),
  reason: z.string().trim().min(1).max(300).optional(),
  payment_method: z.enum(["cash", "transfer", "card", "pix"]).optional(),
}).refine((value) => value.action !== "reject" || !!value.reason, { message: "Informe o motivo da recusa." })
  .refine((value) => value.action !== "complete" || !!value.payment_method, { message: "Informe o pagamento." });

export type CustomerAddress = z.infer<typeof addressSchema>;
