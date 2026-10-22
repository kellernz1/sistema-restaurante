"use client";

import { LoaderCircle, LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";

export default function UnauthorizedPage() {
  const { user, loading, signOut } = useAuth();
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
        <p className="eyebrow">Acesso não configurado</p>
        <h1>Seu usuário ainda não possui um perfil válido.</h1>
        <p>
          Peça ao administrador para conferir seu cadastro e papel de acesso no
          restaurante.
        </p>

        {loading ? (
          <span className="muted-inline">
            <LoaderCircle className="spin" aria-hidden="true" size={18} />
            Verificando sessão...
          </span>
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
            Sair e usar outra conta
          </button>
        ) : (
          <Link className="primary-button compact-button" href="/login">
            Voltar para o login
          </Link>
        )}
      </section>
    </main>
  );
}
