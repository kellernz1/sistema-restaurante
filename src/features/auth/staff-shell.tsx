"use client";

import { useTranslation } from "@/components/language-provider";


import { LoaderCircle, LogOut, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { ROLE_LABELS, ROLE_DASHBOARDS } from "@/lib/auth";

import { useAuth } from "./auth-provider";

export function StaffShell({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const { profile, role, loading, signOut } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setLogoutError(null);
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      setLogoutError(t("Não foi possível sair. Tente novamente."));
      setIsSigningOut(false);
    }
  }

  if (loading) {
    return (
      <main className="centered-state" aria-live="polite">
        <LoaderCircle className="spin" aria-hidden="true" size={28} />
        <p>{t("Carregando seu acesso...")}</p>
      </main>
    );
  }

  if (!role) return <main className="centered-state"><p>{t("Acesso indisponível. Confira seu cadastro com o administrador.")}</p><Link className="back-link" href="/unauthorized">{t("Conferir acesso")}</Link></main>;

  return (
    <div className="staff-app">
      <header className="staff-header">
        <div className="staff-brand">
          <span className="brand-mark brand-mark-small">
            <UtensilsCrossed aria-hidden="true" size={20} />
          </span>
          <div>
            <strong>Mesa Certa</strong>
            <span>{t("Gestão do restaurante")}</span>
          </div>
        </div>

        <nav className="staff-navigation" aria-label={t("Navegação da equipe")}>
          {role && <Link href={ROLE_DASHBOARDS[role]}>{t("Meu painel")}</Link>}
          {role && ["admin", "cashier", "waiter"].includes(role) && <Link href="/orders">{t("Pedidos")}</Link>}
          {role === "admin" && <><Link href="/kitchen">{t("Cozinha")}</Link><Link href="/admin/menu">{t("Cardápio")}</Link><Link href="/admin/tables/qr">{t("QR codes")}</Link><Link href="/admin/settings">{t("Configurações")}</Link></>}
        </nav>
        <div className="staff-account">
          <div className="staff-identity">
            <strong>{profile?.full_name ?? t("Usuário")}</strong>
            {role ? <span className={`role-badge role-${role}`}>{t(ROLE_LABELS[role])}</span> : null}
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <LoaderCircle className="spin" aria-hidden="true" size={17} />
            ) : (
              <LogOut aria-hidden="true" size={17} />
            )}
            <span>{t("Sair")}</span>
          </button>
        </div>
      </header>

      {logoutError ? <p className="header-error" role="alert">{t(logoutError)}</p> : null}
      <main className="staff-content">{t(children)}</main>
    </div>
  );
}
