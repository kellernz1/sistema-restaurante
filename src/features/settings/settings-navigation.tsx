import Link from "next/link";

export function SettingsNavigation({ active }: { active: "restaurant" | "employees" }) {
  return <nav className="settings-tabs" aria-label="Seções das configurações">
    <Link href="/admin/settings" aria-current={active === "restaurant" ? "page" : undefined}>Restaurante</Link>
    <Link href="/admin/settings/employees" aria-current={active === "employees" ? "page" : undefined}>Funcionários</Link>
  </nav>;
}
