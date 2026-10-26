"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { money } from "@/lib/money";
import {auditLabels} from "./labels";
const actions = Object.keys(auditLabels);
type Event = { id: string; created_at: string; actor_name: string | null; approver_name: string | null; action: string; amount_pyg: number; reason: string | null; target_type: string; target_id: string };
export function AuditPanel({ people }: { people: { id: string; full_name: string }[] }) {
  const t = useTranslation();
  const [day, setDay] = useState(""), [action, setAction] = useState(""), [actor, setActor] = useState(""), [approver, setApprover] = useState(""), [events, setEvents] = useState<Event[]>([]), [error, setError] = useState(""), [offset, setOffset] = useState(0), [more, setMore] = useState(false);
  async function load(page: number) {
    try { const query = new URLSearchParams({ offset: String(page) }); for (const [key, value] of Object.entries({ day, action, actor, approver })) if (value) query.set(key, value); const response = await fetch(`/api/staff/audit?${query}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw Error(result.error); setEvents(result.events); setMore(result.has_more); setOffset(page); setError(""); }
    catch (e) { setError((e as Error).message); }
  }
  // Initial query uses the database business day, never the browser's UTC date.
  useEffect(() => { let active = true; void fetch("/api/staff/audit", {cache:"no-store"}).then(async r => {if(!r.ok)throw Error("Request failed");return r.json();}).then(r => {if(active){setEvents(r.events);setMore(r.has_more);}}).catch(() => {if(active)setError("Falha de conexão.");});return () => {active=false;}; }, []);
  return <section className="security-stack"><h1>{t("Auditoria")}</h1><div className="audit-filters"><label>{t("Dia comercial")}<input type="date" value={day} onChange={e => setDay(e.target.value)} /></label><label>{t("Tipo de ação")}<select value={action} onChange={e => setAction(e.target.value)}><option value="">{t("Todos")}</option>{actions.map(a => <option key={a} value={a}>{t(auditLabels[a])}</option>)}</select></label>{([["actor", actor, setActor, "Operador"], ["approver", approver, setApprover, "Aprovador"]] as const).map(([key, value, setter, label]) => <label key={key}>{t(label)}<select value={value} onChange={e => setter(e.target.value)}><option value="">{t("Todos")}</option>{people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>)}</div><button onClick={() => void load(0)}>{t("Filtrar")}</button>{error && <p role="alert">{t(error)}</p>}<div className="audit-events">{events.map(event => <article key={event.id}><strong>{t(auditLabels[event.action] ?? event.action)}</strong><p><time>{new Date(event.created_at).toLocaleString()}</time></p><p>{t("Operador")}: {event.actor_name ?? t("Sistema")} · {t("Aprovador")}: {event.approver_name ?? "—"}</p><p>{money.format(event.amount_pyg)}</p>{event.reason && <p>{event.reason}</p>}<small>{event.target_type} · {event.target_id}</small></article>)}</div><div className="approval-actions"><button disabled={offset === 0} onClick={() => void load(Math.max(0, offset - 100))}>{t("Anterior")}</button><button disabled={!more} onClick={() => void load(offset + 100)}>{t("Próxima")}</button></div></section>;
}
