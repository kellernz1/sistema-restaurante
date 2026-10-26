import { z } from "zod";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson } from "@/lib/public-table-api";
const querySchema = z.strictObject({ day: z.iso.date().optional(), action: z.string().regex(/^[a-z_]{1,80}$/).optional(), actor: z.uuid().optional(), approver: z.uuid().optional(), offset: z.coerce.number().int().min(0).max(100000).default(0) });
export async function GET(request: Request) {
  try {
    const { db } = await requireStaff(["admin"]);
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new PublicApiError(400, "Confira os filtros da auditoria.");
    const p = query.data;
    const result = await db.rpc("audit_timeline", { p_day: p.day, p_action: p.action, p_actor: p.actor, p_approver: p.approver, p_offset: p.offset });
    if (result.error) throw result.error;
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
