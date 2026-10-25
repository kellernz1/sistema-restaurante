import {z} from "zod";
export const servicePolicySchema=z.strictObject({counter_enabled:z.boolean(),uses_waiter:z.boolean(),qr_confirmation:z.enum(["manual","after_first","payment"]),qr_phone:z.enum(["required","optional","off"]),pending_per_table:z.number().int().min(1).max(20),pending_per_phone:z.number().int().min(1).max(20)});
