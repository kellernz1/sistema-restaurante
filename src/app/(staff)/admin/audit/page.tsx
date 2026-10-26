import { requireStaff } from "@/lib/staff-api";
import { AuditPanel } from "@/features/approvals/audit-panel";
export default async function AuditPage() {
  const { db } = await requireStaff(["admin"]);
  const { data } = await db.from("profiles").select("id,full_name").order("full_name");
  return <AuditPanel people={(data ?? []).map(p => ({ ...p, full_name: p.full_name ?? p.id }))} />;
}
