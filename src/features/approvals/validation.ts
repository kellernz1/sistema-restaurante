import { z } from "zod";

export const operationSchema = z.strictObject({
  action: z.enum(["discount", "cancel_item", "cancel_order"]),
  target: z.uuid(),
  mode: z.enum(["amount", "percent"]).optional(),
  value: z.number().int().min(0).max(1_000_000_000_000).optional(),
  reason: z.string().trim().min(2).max(300),
});
export const sensitiveRequestSchema = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("quote"), operation: operationSchema }),
  z.strictObject({ command: z.literal("approve"), request: z.uuid(), approver: z.uuid(), pin: z.string().regex(/^\d{4,6}$/), operation: operationSchema, binding: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ command: z.literal("execute"), request: z.uuid(), operation: operationSchema, binding: z.string().regex(/^[a-f0-9]{64}$/), authorization: z.uuid().nullable() }),
  z.strictObject({ command: z.literal("pin"), pin: z.string().regex(/^\d{4,6}$/), password: z.string().min(1).max(72) }),
]);
export type SensitiveOperation = z.infer<typeof operationSchema>;
