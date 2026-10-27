"use client";

import { useTranslation } from "@/components/language-provider";
import Link from "next/link";

export function SettingsNavigation({ active }: { active: "restaurant" | "employees" | "security"|"license" }) {
  const t = useTranslation();
  return <nav className="settings-tabs" aria-label={t("Seções das configurações")}>
    <Link href="/admin/settings" aria-current={active === "restaurant" ? "page" : undefined}>{t("Restaurante")}</Link>
    <Link href="/admin/settings/employees" aria-current={active === "employees" ? "page" : undefined}>{t("Funcionários")}</Link>
    <Link href="/admin/settings/security" aria-current={active === "security" ? "page" : undefined}>{t("Segurança e aprovações")}</Link>
    <Link href="/admin/audit">{t("Auditoria")}</Link>
    <Link href="/admin/settings/license" aria-current={active==="license"?"page":undefined}>{t("Licença")}</Link>
  </nav>;
}
