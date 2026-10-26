import { requireStaff } from "@/lib/staff-api";
import { publicError, publicJson } from "@/lib/public-table-api";
export async function GET() {
  try {
    const { db } = await requireStaff(["admin", "cashier", "kitchen", "supervisor"]);
    const result = await db.from("kitchen_cancellations").select("id,created_at,reason,snapshot").gte("created_at", new Date(Date.now() - 86400000).toISOString()).order("created_at", { ascending: false }).limit(50);
    if (result.error) throw result.error;
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
