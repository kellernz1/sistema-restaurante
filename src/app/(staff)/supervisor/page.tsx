import { requireStaff } from "@/lib/staff-api";
import { SecurityPanel } from "@/features/approvals/security-panel";
import { ApprovalWorkbench } from "@/features/approvals/workbench";
export default async function SupervisorPage() {
  await requireStaff(["admin", "supervisor"]);
  return <div className="security-stack"><SecurityPanel /><ApprovalWorkbench /></div>;
}
