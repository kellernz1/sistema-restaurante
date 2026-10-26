"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
type Notice = { id: string; created_at: string; reason: string; snapshot: { ticket?: number; number?: number; items?: { name: string; quantity: number }[] } };
export function KitchenCancellations() {
  const t = useTranslation();
  const [notices, setNotices] = useState<Notice[]>([]), [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; async function refresh() { try { const response = await fetch("/api/staff/kitchen-cancellations", { cache: "no-store" }); if (!response.ok) throw Error(); const result = await response.json(); if (active) { setNotices(result); setFailed(false); } } catch { if (active) setFailed(true); } } void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => { active = false; clearInterval(timer); }; }, []);
  return <div>{failed && <p role="alert">{t("Não foi possível atualizar os avisos de cancelamento.")}</p>}{notices.map(n => <article className="kitchen-cancellation" key={n.id}><strong>{t("ITEM CANCELADO")} · {n.snapshot.ticket != null ? `${t("Senha")} ${n.snapshot.ticket}` : `#${n.snapshot.number}`}</strong><p>{n.snapshot.items?.map(i => `${i.quantity} × ${i.name}`).join(" · ")}</p><p>{n.reason}</p><time>{new Date(n.created_at).toLocaleString()}</time></article>)}</div>;
}
