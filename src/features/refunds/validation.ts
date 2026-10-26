import {z}from "zod";
import {MAX_MONEY}from "@/lib/money";
export const refundOperationSchema=z.strictObject({action:z.enum(["refund","cancel_refund"]),target:z.uuid(),amount:z.number().int().min(1).max(MAX_MONEY).optional(),reason:z.string().trim().min(2).max(300)}).refine(o=>o.action!=="refund"||o.amount!==undefined);
export const refundRequestSchema=z.discriminatedUnion("command",[
 z.strictObject({command:z.literal("quote"),operation:refundOperationSchema}),
 z.strictObject({command:z.literal("approve"),request:z.uuid(),operation:refundOperationSchema,binding:z.string().regex(/^[a-f0-9]{64}$/),approver:z.uuid(),pin:z.string().regex(/^\d{4,6}$/)}),
 z.strictObject({command:z.literal("execute"),request:z.uuid(),operation:refundOperationSchema,binding:z.string().regex(/^[a-f0-9]{64}$/),authorization:z.uuid().nullable(),confirmed:z.literal(true)})
]);
