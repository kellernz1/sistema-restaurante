import { z } from "zod";

export const employeeRoleSchema = z.enum(["admin", "cashier", "waiter", "kitchen", "supervisor"]);
export const employeeCreateSchema = z.strictObject({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(8).max(72).refine((value) => value.trim().length > 0),
  role: employeeRoleSchema,
  is_active: z.boolean().default(true),
});
export const employeeUpdateSchema = z.union([
  z.strictObject({ full_name: z.string().trim().min(2).max(120), role: employeeRoleSchema }),
  z.strictObject({ is_active: z.boolean() }),
]);
