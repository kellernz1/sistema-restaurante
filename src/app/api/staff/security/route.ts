import { z } from "zod";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
const policy = z.strictObject({ require_item_approval: z.boolean(), require_order_approval: z.boolean(), require_discount_approval: z.boolean(), discount_limit_pyg: z.number().int().min(0).max(1e12), discount_limit_bps: z.number().int().min(0).max(10000), pin_failures: z.number().int().min(1).max(10), pin_lock_minutes: z.number().int().min(1).max(60), authorization_seconds: z.number().int().min(30).max(300), discount_reasons: z.array(z.string().trim().min(1).max(80)).min(1).max(20) });
export async function PATCH(request: Request) {
  try {
    const { db } = await requireStaff(["admin"]);
    const parsed = policy.safeParse(await readPublicBody(request));
    if (!parsed.success) throw new PublicApiError(400, "Confira a política de segurança.");
    const result = await db.rpc("set_security_policy", { p_policy: parsed.data });
    if (result.error) throw result.error;
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
