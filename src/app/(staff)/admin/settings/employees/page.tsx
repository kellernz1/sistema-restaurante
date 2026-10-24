import { getTranslation } from "@/lib/i18n/server";
import { EmployeeManager } from "@/features/employees/employee-manager";
import { listEmployees } from "@/features/employees/service";
import { SettingsNavigation } from "@/features/settings/settings-navigation";
import { requireStaff } from "@/lib/staff-api";

export default async function EmployeesPage() {
  const t = await getTranslation();
  const { userId } = await requireStaff(["admin"]);
  const employees = await listEmployees().catch(() => null);
  return <div className="settings-stack"><SettingsNavigation active="employees" />{employees
    ? <EmployeeManager initialEmployees={employees} currentUserId={userId} />
    : <p role="alert">{t("Não foi possível carregar os funcionários. Confira a conexão e atualize a página.")}</p>}</div>;
}
