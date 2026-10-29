"use client";
import "@/app/approvals.css";
import "./staff-navigation.css";
import { LicenseBanner } from "@/features/licensing/license-panel";
import { CashSessionBar } from "@/features/cash-sessions/session-bar";
import { OperationsAlerts } from "@/features/operations/operations-panel";
import { useServiceModes } from "@/features/service-modes/use-service-modes";
import { usePathname } from "next/navigation";
import { PrintQueue } from "@/features/printing/print-queue";
import { useTranslation } from "@/components/language-provider";
import { LanguagePicker } from "@/components/language-picker";
import { ThemePicker } from "@/components/theme-picker";
import { LoaderCircle, LogOut, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ROLE_LABELS } from "@/lib/auth";
import { useAuth } from "./auth-provider";
import { WorkspaceNavigation } from "./workspace-navigation";

export function StaffShell({ children }: { children: ReactNode }) {
  const t = useTranslation(), pathname = usePathname();
  const { profile, role, loading, signOut } = useAuth();
  const modes = useServiceModes(!loading && !!role && role !== "supervisor");
  const [logoutError, setLogoutError] = useState<string | null>(null), [isSigningOut, setIsSigningOut] = useState(false);
  const [printStatus, setPrintStatus] = useState("Consultando...");
  const [navigationNotice, setNavigationNotice] = useState(false);
  const header = useRef<HTMLElement>(null), content = useRef<HTMLElement>(null), account = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const bar = header.current, main = content.current;
    if (!bar || !main) return;
    const update = () => { const height = bar.getBoundingClientRect().height; main.style.setProperty("--cashier-sticky-bottom", `${height + 12}px`); main.style.setProperty("--cashier-header-height", `${height}px`); };
    const observer = new ResizeObserver(update); observer.observe(bar); update();
    return () => { observer.disconnect(); main.style.removeProperty("--cashier-sticky-bottom"); main.style.removeProperty("--cashier-header-height"); };
  }, [loading, role]);
  async function handleSignOut() {
    setLogoutError(null); setIsSigningOut(true);
    try { await signOut(); }
    catch { setLogoutError(t("Não foi possível sair. Tente novamente.")); setIsSigningOut(false); }
  }
  function guardNavigation(event: MouseEvent<HTMLElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link) return;
    if (pathname === "/cashier/counter" && new URL(link.href).pathname !== pathname && document.querySelector(".counter-discount")) {
      event.preventDefault(); event.stopPropagation(); setNavigationNotice(true);
    } else setNavigationNotice(false);
  }
  if (loading) return <main className="centered-state" aria-live="polite"><LoaderCircle className="spin" aria-hidden="true" size={28} /><p>{t("Carregando seu acesso...")}</p></main>;
  if (!role) return <main className="centered-state"><p>{t("Acesso indisponível. Confira seu cadastro com o administrador.")}</p><Link className="back-link" href="/unauthorized">{t("Conferir acesso")}</Link></main>;
  const cashier = ["admin", "cashier"].includes(role), printing = ["admin", "cashier", "kitchen"].includes(role);
  return <div className="staff-app">
    <a className="staff-skip" href="#staff-main">{t("Ir para o conteúdo")}</a>
    <header ref={header} className="staff-header staff-operational-header" onClickCapture={guardNavigation}>
      <div className="staff-brand"><span className="brand-mark brand-mark-small"><UtensilsCrossed aria-hidden="true" size={20} /></span><strong>Mesa Certa</strong></div>
      <WorkspaceNavigation role={role} modes={modes} pathname={pathname} />
      <details ref={account} className="staff-account-menu" onKeyDown={event => { if (event.key === "Escape" && account.current) { account.current.open = false; account.current.querySelector("summary")?.focus(); } }}>
        <summary>{t("Conta")} <span aria-hidden="true">▾</span></summary>
        <div className="staff-account-panel"><strong>{profile?.full_name ?? t("Usuário")}</strong><span>{t(ROLE_LABELS[role])}</span><LanguagePicker /><ThemePicker />
          <button type="button" className="ghost-button" onClick={handleSignOut} disabled={isSigningOut}><LogOut aria-hidden="true" size={17} />{t("Sair")}</button>
        </div>
      </details>
      {cashier && <CashSessionBar timezone={modes?.business_timezone} dayStart={modes?.business_day_start} current={pathname.startsWith("/cashier/sessions")} />}
      {printing && <Link className={`arrow-link ui-link staff-print-health${printStatus === "Sem alertas" ? "" : " staff-print-attention"}`} href="#staff-printing">{t("Impressão")}: {t(printStatus)}<span aria-hidden="true">›</span></Link>}
      {navigationNotice && <p className="workspace-notice" role="status">{t("Conclua o pedido ou remova o desconto antes de sair.")}</p>}
    </header>
    {logoutError && <p className="header-error" role="alert">{t(logoutError)}</p>}
    {cashier && <OperationsAlerts />}{cashier && <LicenseBanner manage={role === "admin"} />}
    <main ref={content} id="staff-main" tabIndex={-1} className="staff-content">
      {role === "waiter" && !modes?.uses_waiter ? <p className="order-panel">{t("O atendimento com garçom está desativado. Fale com o administrador.")}</p> : <>
        {printing && <PrintQueue compact={pathname.startsWith("/cashier")} onHealthChange={setPrintStatus} />}
        {t(children)}
      </>}
    </main>
  </div>;
}
