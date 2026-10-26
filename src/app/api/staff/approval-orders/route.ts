import { requireStaff } from "@/lib/staff-api";
import { publicError, publicJson } from "@/lib/public-table-api";
export async function GET() {
  try {
    const { db } = await requireStaff(["admin", "supervisor", "cashier"]);
    const result = await db.rpc("approval_workbench");
    if (result.error) throw result.error;
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
