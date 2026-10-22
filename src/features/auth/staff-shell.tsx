"use client";

import { LoaderCircle, LogOut, UtensilsCrossed } from "lucide-react";
import { type ReactNode, useState } from "react";

import { ROLE_LABELS } from "@/lib/auth";

import { useAuth } from "./auth-provider";

export function StaffShell({ children }: { children: ReactNode }) {
  const { profile, role, loading, signOut } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setLogoutError(null);
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      setLogoutError("Não foi possível sair. Tente novamente.");
      setIsSigningOut(false);
    }
  }

  if (loading) {
    return (
      <main className="centered-state" aria-live="polite">
        <LoaderCircle className="spin" aria-hidden="true" size={28} />
        <p>Carregando seu acesso...</p>
      </main>
    );
  }

  return (
    <div className="staff-app">
      <header className="staff-header">
        <div className="staff-brand">
          <span className="brand-mark brand-mark-small">
            <UtensilsCrossed aria-hidden="true" size={20} />
          </span>
          <div>
            <strong>Mesa Certa</strong>
            <span>Gestão do restaurante</span>
          </div>
        </div>

        <div className="staff-account">
          <div className="staff-identity">
            <strong>{profile?.full_name ?? "Usuário"}</strong>
            {role ? <span className={`role-badge role-${role}`}>{ROLE_LABELS[role]}</span> : null}
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
            <span>Sair</span>
          </button>
        </div>
      </header>

      {logoutError ? <p className="header-error" role="alert">{logoutError}</p> : null}
      <main className="staff-content">{children}</main>
    </div>
  );
}
