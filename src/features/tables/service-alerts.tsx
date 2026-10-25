"use client";

import { useTranslation } from "@/components/language-provider";


import type { QueryData } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";

function pendingQuery(db: ReturnType<typeof createClient>) {
  return db.from("orders").select("id, order_number, source, table_id, tables(table_number)")
    .eq("order_type", "dine_in").in("source", ["qr", "nfc"]).eq("status", "pending_confirmation").order("created_at");
}
function requestsQuery(db: ReturnType<typeof createClient>) {
  return db.from("service_requests").select("id, type, table_id, tables(table_number)").eq("status", "open").order("created_at");
}

export function ServiceAlerts() {
  const t = useTranslation();
  const [db] = useState(createClient);
  const [orders, setOrders] = useState<QueryData<ReturnType<typeof pendingQuery>>>([]);
  const [requests, setRequests] = useState<QueryData<ReturnType<typeof requestsQuery>>>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++revision.current;
    const [pending, calls] = await Promise.all([pendingQuery(db), requestsQuery(db)]);
    if (version !== revision.current) return;
    if (pending.error || calls.error) setError(t("Não foi possível carregar os chamados. Confira a conexão e a migration da Fase 8."));
    else { setOrders(pending.data); setRequests(calls.data); setError(""); }
  }, [db, t]);

  useEffect(() => {
    let alive = true;
    const invalidate = () => { revision.current++; };
    const update = () => { if (alive) void refresh(); };
    const channel = db.channel("waiter-service-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, update)
      .subscribe((status) => {
        if (!alive) return;
        if (status === "SUBSCRIBED") update();
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setError(t("Tempo real dos chamados indisponível. Use Atualizar chamados."));
      });
    update();
    const visible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", visible); window.addEventListener("online", update);
    return () => { alive = false; invalidate(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", update); void db.removeChannel(channel); };
  }, [db, refresh, t]);

  async function act(kind: "accept" | "reject" | "attend", id: string) {
    if (lock.current) return;
    const reason=kind==="reject"?window.prompt(t("Motivo obrigatório")):null;
    if(kind==="reject"&&!reason?.trim())return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      const result = kind === "attend"
        ? await db.rpc("attend_service_request", { p_request_id: id })
        : await db.rpc("review_legacy_table_order", { p_order_id: id, p_accept: kind === "accept",p_reason:reason??undefined });
      if (result.error) throw result.error;
      setNotice(t("Atendimento atualizado."));
    } catch { setNotice(t("Não foi possível concluir. Outro atendente pode ter atualizado este chamado.")); }
    finally { await refresh(); lock.current = false; setBusy(false); }
  }

  return <section className="order-panel service-alerts"><div className="table-detail-heading"><h2>{t("Atendimento ")}<span className="status-pill" aria-live="polite">{t(orders.length + requests.length)} {t(" pendentes")}</span></h2><button className="ghost-button" disabled={busy} onClick={() => void refresh()}>{t("Atualizar chamados")}</button></div>
    {error && <p className="table-notice table-notice-error" role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
    {!orders.length && !requests.length && !error && <p>{t("Nenhum pedido ou chamado pendente.")}</p>}
    {orders.map((order) => <article className="service-alert" key={order.id}><div><strong>{t("Mesa ")}{order.tables?.table_number} {t(" · Comanda #")}{order.order_number}</strong><p>via {t(order.source.toUpperCase())} {t(" · Aguardando confirmação")}</p><Link className="back-link" href={`/cashier?table=${order.table_id}`}>{t("Conferir itens")}</Link></div><div className="cashier-actions"><button className="primary-button" disabled={busy} onClick={() => void act("accept", order.id)}>{t("Confirmar")}</button><button className="ghost-button" disabled={busy} onClick={() => void act("reject", order.id)}>{t("Rejeitar")}</button></div></article>)}
    {requests.map((request) => <article className="service-alert" key={request.id}><div><strong>{t("Mesa ")}{request.tables?.table_number}</strong><p>{t(request.type === "bill" ? t("Pediu a conta") : t("Chamou o atendente"))}</p>{request.type==="bill"&&<Link className="back-link" href={`/cashier?table=${request.table_id}`}>{t("Abrir conta da mesa")}</Link>}</div><button className="ghost-button" disabled={busy} onClick={() => void act("attend", request.id)}>{t("Marcar atendido")}</button></article>)}
  </section>;
}
