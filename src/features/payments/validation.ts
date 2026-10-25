import { z } from "zod";
import { MAX_MONEY } from "../../lib/money.ts";
const amount = z.number().int().min(0).max(MAX_MONEY);
export const paymentRequestSchema = z.strictObject({
  request_id: z.uuid(),
  lines: z.array(z.strictObject({
    method: z.enum(["cash", "transfer", "card", "pix"]),
    currency: z.enum(["PYG", "BRL"]), original_amount: amount, amount_pyg: amount, rate_id: z.uuid().optional(),
  }).refine((line) => line.method !== "pix" || line.currency === "BRL")).min(1).max(20),
});
export const exchangeRateSchema = z.strictObject({
  rate: z.string().regex(/^\d{1,9}(\.\d{1,8})?$/).refine((value) => Number(value) >= 0.01 && Number(value) <= 100000000),
  rounding: z.enum(["none", "half_real", "whole_real"]),
});
