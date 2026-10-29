import { requireStaff } from "@/lib/staff-api";
import { SecurityPanel } from "@/features/approvals/security-panel";
export default async function SecurityPage() {
  await requireStaff(["admin"]);
  return <div className="security-stack"><SecurityPanel administrator /></div>;
}
