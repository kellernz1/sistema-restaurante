"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { createClient } from "@/utils/supabase/client";

export function HumanHandoffs() {
  const { role } = useAuth();
  const allowed = role === "admin" || role === "cashier";
  const [db] = useState(createClient);
  const [rows, setRows] = useState<{ phone: string; last_message_at: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    if (!allowed) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const result = await db.rpc("whatsapp_handoffs", {});
      if (!alive) return;
      if (result.error) setError("Não foi possível carregar os atendimentos do WhatsApp. Confira a migration e a conexão.");
      else { setRows(result.data); setError(""); }
      timer = setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [allowed, db, revision]);
  async function resolve(phone: string) {
    if (lock.current || !window.confirm("Liberar este atendimento? O bot poderá responder à próxima mensagem do cliente.")) return;
    lock.current = true; setBusy(true);
    try { const result = await db.rpc("resolve_whatsapp_handoff", { p_phone: phone }); if (result.error) throw result.error; setRevision((value) => value + 1); }
    catch { setError("Não foi possível liberar. Aguarde a conversa terminar de processar e tente novamente."); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!allowed) return null;
  return <details className="order-panel handoff-banner orders-screen-only"><summary><span>WhatsApp · Atendimento humano</span><span className="status-pill" aria-live="polite">{rows.length}</span>{error && <span className="handoff-error">Falha ao atualizar</span>}<span className="handoff-expand" aria-hidden="true">›</span></summary><div className="table-detail-heading"><h2>WhatsApp · Atendimento humano <span className="status-pill" aria-live="polite">{rows.length}</span></h2><button className="ghost-button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Atualizar atendimentos</button></div>{error && <p className="table-notice table-notice-error" role="alert">{error}</p>}{!rows.length && !error && <p>Nenhum atendimento humano pendente.</p>}{rows.map((row) => <article className="service-alert" key={row.phone}><div><strong>{row.phone}</strong><p>Bot pausado. Confira a conversa antes de liberar.</p><a className="back-link" href={`https://wa.me/${row.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a></div><button className="ghost-button" disabled={busy} onClick={() => void resolve(row.phone)}>Resolver e liberar bot</button></article>)}</details>;
}
