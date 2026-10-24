"use client";

import { useTranslation } from "@/components/language-provider";


import { LoaderCircle, LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";

export default function UnauthorizedPage() {
  const t = useTranslation();
  const { user, profile, loading, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="unauthorized-page">
      <section className="unauthorized-card">
        <span className="placeholder-icon danger-icon">
          <ShieldAlert aria-hidden="true" size={30} />
        </span>
        <p className="eyebrow">{t("Acesso indisponível")}</p>
        <h1>{t(profile?.is_active === false ? t("Seu acesso está bloqueado.") : t("Seu usuário ainda não possui um perfil válido."))}</h1>
        <p>
          {t("Peça ao administrador para conferir seu cadastro e papel de acesso no restaurante.")}</p>

        {loading ? (
          <span className="muted-inline">
            <LoaderCircle className="spin" aria-hidden="true" size={18} />
            {t("Verificando sessão...")}</span>
        ) : user ? (
          <button
            className="primary-button compact-button"
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <LoaderCircle className="spin" aria-hidden="true" size={17} />
            ) : (
              <LogOut aria-hidden="true" size={17} />
            )}
            {t("Sair e usar outra conta")}</button>
        ) : (
          <Link className="primary-button compact-button" href="/login">
            {t("Voltar para o login")}</Link>
        )}
      </section>
    </main>
  );
}
