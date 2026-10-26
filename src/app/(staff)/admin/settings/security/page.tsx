import { requireStaff } from "@/lib/staff-api";
import { SecurityPanel } from "@/features/approvals/security-panel";
import { SettingsNavigation } from "@/features/settings/settings-navigation";
export default async function SecurityPage() {
  await requireStaff(["admin"]);
  return <div className="security-stack"><SettingsNavigation active="security" /><SecurityPanel administrator /></div>;
}
