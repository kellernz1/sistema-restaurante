"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/language-provider";
import { createClient } from "@/utils/supabase/client";
import { customerApi } from "@/features/customer-ordering/public-client";
import { PaymentPanel } from "@/features/payments/payment-panel";
import type { StoredRow } from "@/types/records";
import { counterWaitTone } from "./domain";

export function CounterQueue({ greenMinutes, yellowMinutes }: { greenMinutes: number; yellowMinutes: number }) {
  const t = useTranslation();
  const [db] = useState(createClient);
  const [orders, setOrders] = useState<StoredRow<"orders">[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const { data, error } = await db.from("orders").select("*").eq("is_counter", true).in("status", ["open", "ready"]).order("counter_ready_at", { nullsFirst: false }).order("created_at");
    if (error) setError(t("Não foi possível atualizar as senhas.")); else { setOrders(data ?? []); setError(""); }
  }, [db, t]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const polling = setInterval(() => void refresh(), 15000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const channel = db.channel("counter-queue").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh()).subscribe();
    const online = () => void refresh(); window.addEventListener("online", online);
    return () => { clearTimeout(timer); clearInterval(polling); clearInterval(clock); window.removeEventListener("online", online); void db.removeChannel(channel); };
  }, [db, refresh]);
  async function deliver(id: string) {
    if (busy) return;
    setBusy(id);
    try { await customerApi(`/api/staff/counter/${id}/deliver`, { method: "POST" }); await refresh(); }
    catch { setError(t("A senha precisa estar pronta e paga antes da entrega.")); }
    finally { setBusy(null); }
  }
  return <section className="counter-queue"><header className="section-heading"><h2>{t("Prontos para chamar")}</h2><button type="button" className="back-link" onClick={() => void refresh()}>{t("Atualizar")}</button></header>
    {error && <p role="alert">{error}</p>}
    {!orders.some((order) => order.status === "ready") && <p>{t("Nenhuma senha pronta aguardando retirada.")}</p>}
    {orders.filter((order) => order.status === "ready").map((order) => {
      const readyAt = order.counter_ready_at ?? order.created_at;
      const tone = counterWaitTone(readyAt, now ?? Date.parse(readyAt), greenMinutes, yellowMinutes);
      return <article key={order.id} className={`order-panel counter-ready counter-wait-${tone}`}><strong className="counter-ticket">{t("Senha {0}").replace("{0}", String(order.counter_ticket))}</strong>{order.counter_name && <h3>{order.counter_name}</h3>}
        <small>{t("Dia comercial")}: {order.counter_business_date}</small><p>{t("Pronto há {0} min").replace("{0}", String(now === null ? "—" : Math.max(0, Math.floor((now - Date.parse(readyAt)) / 60000))))} · {t(tone === "green" ? "Dentro do prazo" : tone === "yellow" ? "Atenção à espera" : "Prioridade de retirada")}</p>
        <div className="cashier-actions"><Link className="back-link" href={`/print/counter/${order.id}`}>{t("Comprovante")}</Link>{order.payment_status !== "paid" ? <button type="button" className="primary-button" onClick={() => setPaying(paying === order.id ? null : order.id)}>{t("Receber pagamento")}</button> : <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void deliver(order.id)}>{t("Marcar como entregue")}</button>}</div>
        {paying === order.id && <PaymentPanel orderId={order.id} total={order.total_amount} closed={order.payment_status === "paid"} onRecorded={async () => { setPaying(null); await refresh(); }} />}
      </article>;
    })}
    <details><summary>{t("Senhas em preparo")}</summary>{orders.filter((order) => order.status === "open").map((order) => <p key={order.id}><Link href={`/print/counter/${order.id}`}>{t("Senha {0}").replace("{0}", String(order.counter_ticket))}{order.counter_name ? ` · ${order.counter_name}` : ""}</Link></p>)}</details>
  </section>;
}
