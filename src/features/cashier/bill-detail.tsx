"use client";

import { useTranslation } from "@/components/language-provider";


import { useCallback, useEffect, useRef, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";
import { PaymentPanel } from "@/features/payments/payment-panel";
import type { StoredRow } from "@/types/records";
import { createClient } from "@/utils/supabase/client";
import {X} from "lucide-react";
import "./bill-dialog.css";

import { billItemsQuery, type BillItem, type CashierTable } from "./cashier-query";
import { billSubtotal, lineSubtotal } from "./bill-totals";

type Order = StoredRow<"orders">;
const statuses = { pending: "Recebido", preparing: "Preparando", ready: "Pronto", delivered: "Entregue" };
import { money as currency } from "@/lib/money";

export function BillDetail({ table, onClosed }: { table: CashierTable; onClosed: () => Promise<void> }) {
  const t = useTranslation();
  const [db] = useState(createClient);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const orderId = useRef<string | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    try {
      let query = db.from("orders").select("*").eq("order_type", "dine_in").eq("table_id", table.id);
      query = orderId.current ? query.eq("id", orderId.current) : query.not("status", "in", '("closed","cancelled")');
      const result = await query.maybeSingle();
      if (result.error) throw result.error;
      const itemResult = result.data ? await billItemsQuery(db, result.data.id) : null;
      if (itemResult?.error) throw itemResult.error;
      if (!mounted.current || version !== generation.current) return;
      if (result.data) orderId.current = result.data.id;
      setOrder(result.data);
      setItems(itemResult?.data ?? []);
      setError("");
    } catch {
      if (mounted.current && version === generation.current) setError(t("Não foi possível atualizar a conta. Confira a conexão e tente novamente."));
    } finally {
      if (mounted.current && version === generation.current) setLoading(false);
    }
  }, [db, table.id, t]);

  useEffect(() => {
    mounted.current = true;
    const update = () => { if (mounted.current) void refresh(); };
    const invalidate = () => { generation.current++; };
    const channel = db.channel(`cashier-bill-${table.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `table_id=eq.${table.id}` }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, update)
      .subscribe((status) => { if (status === "SUBSCRIBED") update(); });
    update();
    const visible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", update);
    return () => {
      mounted.current = false;
      invalidate();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", update);
      void db.removeChannel(channel);
    };
  }, [db, refresh, table.id]);

  useEffect(() => {
    const element = dialog.current;
    if (confirmation !== null && !element?.open) element?.showModal();
    if (confirmation === null && element?.open) element.close();
  }, [confirmation]);
  useEffect(()=>{if(confirmation===null)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;};},[confirmation]);

  const subtotal = billSubtotal(items);
  const total = subtotal + (order?.delivery_fee ?? 0);
  const fingerprint = JSON.stringify([order?.id, order?.status, order?.total_amount, items]);
  const unpaid = !!order && !["closed", "cancelled"].includes(order.status);
  const undelivered = items.some((item) => item.status !== "delivered");
  const totalsMatch = !!order && total === order.total_amount;
  const disabled = loading || busy || !!error || !totalsMatch;
  const staleConfirmation = confirmation !== fingerprint;

  return <section className="order-panel cashier-bill" aria-busy={loading || busy}>
    <div className="table-detail-heading"><div><span className="eyebrow">{t(order ? t(`Comanda #${order.order_number}`) : t("Comanda"))}</span><h2>{t("Mesa ")}{table.table_number}</h2></div><OrderTypeBadge type="dine_in" /></div>
    {notice && <p className="table-notice table-notice-info cashier-screen-only" role="status">{t(notice)}</p>}
    {error && <p className="table-notice table-notice-error cashier-screen-only" role="alert">{t(error)}</p>}
    {loading && <p className="cashier-screen-only" role="status">{t("Atualizando conta...")}</p>}
    {!order && !loading && <p>{t("Nenhuma comanda ativa encontrada para esta mesa.")}</p>}
    {order && <>
      <p>{t(order.status === "closed" ? t("Conta encerrada · Pagamento recebido") : order.status === "cancelled" ? t("Comanda cancelada") : t("Conta em aberto"))}</p>
      {undelivered && unpaid && <p className="table-notice table-notice-info cashier-screen-only">{t("Há itens ainda não entregues. Confira com o garçom antes de fechar a conta.")}</p>}
      <div className="bill-table-scroll"><table className="bill-table"><caption>{t("Itens da comanda")}</caption><thead><tr><th scope="col">{t("Produto")}</th><th scope="col">{t("Qtd.")}</th><th scope="col">{t("Unitário")}</th><th scope="col">{t("Subtotal")}</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.products?.name ?? t("Produto")}</strong>{item.notes && <p>{item.notes}</p>}<small className="cashier-screen-only">{t(statuses[item.status])}</small></td><td>{item.quantity}</td><td>{t(currency.format(item.unit_price))}</td><td>{t(currency.format(lineSubtotal(item)))}</td></tr>)}</tbody></table></div>
      {!items.length && <p>{t("Nenhum item nesta comanda.")}</p>}
      {order.notes && <p>{t("Observações: ")}{order.notes}</p>}
      <p className="order-total">{t("Total ")}<strong>{t(currency.format(order.status === "closed" ? order.total_amount : total))}</strong></p>
      {!totalsMatch && <p className="table-notice table-notice-error cashier-screen-only" role="alert">{t("Os totais estão sendo conferidos. Atualize a conta antes de continuar.")}</p>}
      {order.status === "closed" && <div className="receipt-summary"><p>{t("Fechamento: ")}{t(order.closed_at ? new Date(order.closed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : t("Não informado"))}</p><p>{t("Comprovante de atendimento — sem valor fiscal.")}</p></div>}
      {order.status === "closed" && <PaymentPanel orderId={order.id} total={order.total_amount} closed onRecorded={() => {}} />}
      <div className="cashier-actions cashier-screen-only">
        {order.qr_prepaid_account&&order.payment_status==="paid"&&order.status!=="closed"&&<button className="primary-button" disabled={busy} onClick={async()=>{setBusy(true);try{const result=await db.rpc("release_paid_table",{p_table:table.id});if(result.error)throw result.error;await refresh();await onClosed();}catch{setNotice(t("Confira pagamentos e pedidos pendentes antes de liberar a mesa."));}finally{setBusy(false);}}}>{t("Liberar mesa paga")}</button>}
        {unpaid && <button className="primary-button" disabled={disabled} onClick={() => setConfirmation(fingerprint)}>{t("Fechar conta")}</button>}
        {order.status === "closed" && <button className="primary-button" disabled={disabled} onClick={() => window.print()}>{t("Imprimir comprovante")}</button>}
      </div>
    </>}
    <button className="ghost-button cashier-screen-only" disabled={busy || loading} onClick={() => void refresh()}>{t("Atualizar conta")}</button>
    <dialog ref={dialog} className="bill-dialog" aria-labelledby="bill-confirmation-title" onCancel={(event) => { if (busy) event.preventDefault(); else setConfirmation(null); }} onClose={() => { if (!mutation.current) setConfirmation(null); }}>
      <div className="bill-dialog-shell"><header className="bill-dialog-header"><div><p className="eyebrow">{t("Mesa ")}{table.table_number}</p><h2 id="bill-confirmation-title">{t("Confirmar fechamento")}</h2></div><button type="button" className="ghost-button bill-dialog-close" disabled={busy} aria-label={t("Fechar confirmação")} onClick={()=>setConfirmation(null)}><X size={22} aria-hidden="true"/></button></header>
      <div className="bill-dialog-total"><span>{t("Total")}</span><strong>{currency.format(total)}</strong></div>
      {(undelivered||staleConfirmation)&&<div className="bill-dialog-notices">{undelivered && <p className="table-notice table-notice-info">{t("Ainda há itens não entregues. Confira antes de fechar.")}</p>}{staleConfirmation && <p role="alert">{t("A conta foi alterada. Cancele e confira os itens novamente.")}</p>}</div>}
      {!staleConfirmation && order && <PaymentPanel key={order.id} orderId={order.id} total={total} closed={order.status === "closed"} onBusyChange={setBusy} secondaryAction={<button type="button" className="ghost-button" disabled={busy} onClick={()=>setConfirmation(null)}>{t("Cancelar")}</button>} onRecorded={async (closed) => { await refresh(); await onClosed(); if (closed) setConfirmation(null); setNotice(t("Pagamentos atualizados.")); }} />}
      {staleConfirmation&&<footer className="bill-dialog-stale"><button type="button" className="ghost-button" disabled={busy} onClick={()=>setConfirmation(null)}>{t("Cancelar")}</button></footer>}
      </div>
    </dialog>
  </section>;
}
