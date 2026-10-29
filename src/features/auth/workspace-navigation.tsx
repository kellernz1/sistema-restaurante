"use client";

import Link from "next/link";
import { lazy, Suspense, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "@/components/language-provider";
import { operationDestinations, isCurrentDestination, type Destination, type NavigationModes } from "./navigation";
import type { UserRole } from "@/lib/auth";
const AdministrationNavigation = lazy(() => import("./administration-navigation"));

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback); window.addEventListener("popstate", callback); window.addEventListener("staff-navigation", callback);
  return () => { window.removeEventListener("hashchange", callback); window.removeEventListener("popstate", callback); window.removeEventListener("staff-navigation", callback); };
}

export function WorkspaceNavigation({ role, modes, pathname }: { role: UserRole; modes: NavigationModes | null; pathname: string }) {
  const t = useTranslation(), hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const admin = role === "admin" && (pathname.startsWith("/admin") || pathname === "/supervisor");
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const entries = operationDestinations(role, modes, pathname);
  function navigate() {
    setExpanded(false);
    setTimeout(() => window.dispatchEvent(new Event("staff-navigation")), 100);
  }
  function link(entry: Destination) {
    return <Link key={entry.id} href={entry.href} prefetch={false} data-destination={entry.id} aria-current={isCurrentDestination(entry, pathname, hash) ? "page" : undefined} onClick={navigate}>{t(entry.label)}</Link>;
  }
  const current = entries.find(entry => isCurrentDestination(entry, pathname, hash));
  return <div className={`workspace-navigation${admin ? " workspace-administration" : ""}`} onKeyDown={event => { if (event.key === "Escape") { setExpanded(false); toggle.current?.focus(); } }}>
    {role === "admin" && <div className="workspace-spaces" aria-label={t("Espaço de trabalho")}>{[{id:"operation-space",label:"Operação",href:modes?.counter_enabled?"/cashier/counter":"/cashier"},{id:"administration-space",label:"Administração",href:"/admin"}].map(entry=><Link key={entry.id} href={entry.href} prefetch={false} aria-current={(entry.id==="administration-space")===admin?"location":undefined} onClick={navigate}>{t(entry.label)}</Link>)}</div>}
    <button ref={toggle} type="button" className="workspace-toggle" aria-expanded={expanded} aria-controls="workspace-destinations" onClick={() => setExpanded(value => !value)}>{t(admin ? "Navegação da administração" : current?.label ?? "Espaço de trabalho")} <span aria-hidden="true">▾</span></button>
    <nav id="workspace-destinations" className="workspace-destinations" data-expanded={expanded} aria-label={t(admin ? "Navegação da administração" : "Navegação da equipe")}>
      {admin ? expanded && <Suspense fallback={<p role="status">{t("Carregando...")}</p>}><AdministrationNavigation modes={modes} pathname={pathname} hash={hash} navigate={navigate}/></Suspense> : entries.map(link)}
    </nav>
  </div>;
}
