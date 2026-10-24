"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";
import { customerApi } from "@/features/customer-ordering/public-client";
import type { Database } from "@/types/database.types";
import type { StoredRow } from "@/types/records";
import { createClient } from "@/utils/supabase/client";

import { billItemsQuery, type BillItem, type CashierTable } from "./cashier-query";
import { billSubtotal, lineSubtotalInCents } from "./bill-totals";

type Order = StoredRow<"orders">;
type Payment = Database["public"]["Enums"]["payment_method"];
const payments: Record<Payment, string> = { cash: "Dinheiro", card: "Cartão", pix: "Pix" };
const statuses = { pending: "Recebido", preparing: "Preparando", ready: "Pronto", delivered: "Entregue" };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function BillDetail({ table, onClosed }: { table: CashierTable; onClosed: () => Promise<void> }) {
  const [db] = useState(createClient);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [payment, setPayment] = useState<Payment>("cash");
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
      if (mounted.current && version === generation.current) setError("Não foi possível atualizar a conta. Confira a conexão e tente novamente.");
    } finally {
      if (mounted.current && version === generation.current) setLoading(false);
    }
  }, [db, table.id]);

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

  const subtotal = billSubtotal(items);
  const total = subtotal + (order?.delivery_fee ?? 0);
  const fingerprint = JSON.stringify([order?.id, order?.status, order?.total_amount, items]);
  const unpaid = !!order && !["closed", "cancelled"].includes(order.status);
  const undelivered = items.some((item) => item.status !== "delivered");
  const totalsMatch = !!order && Math.round(total * 100) === Math.round(order.total_amount * 100);
  const disabled = loading || busy || !!error || !totalsMatch;
  const staleConfirmation = confirmation !== fingerprint;

  async function closeBill() {
    if (mutation.current || disabled || !unpaid || !order || staleConfirmation) return;
    mutation.current = true;
    setBusy(true);
    setNotice("");
    try {
      const { order: data } = await customerApi<{ order: Order }>(`/api/staff/orders/${order.id}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_method: payment }),
      });
      if (mounted.current) {
        setOrder(data);
        setConfirmation(null);
        setNotice("Conta fechada com sucesso. A mesa foi liberada.");
      }
      await onClosed();
    } catch {
      if (mounted.current) {
        setConfirmation(null);
        setNotice("Não foi possível confirmar o fechamento. A conta pode ter sido encerrada por outra pessoa. Confira o estado atualizado antes de tentar novamente.");
      }
    } finally {
      if (mounted.current) { await refresh(); setBusy(false); }
      mutation.current = false;
    }
  }

  return <section className="order-panel cashier-bill" aria-busy={loading || busy}>
    <div className="table-detail-heading"><div><span className="eyebrow">{order ? `Comanda #${order.order_number}` : "Comanda"}</span><h2>Mesa {table.table_number}</h2></div><OrderTypeBadge type="dine_in" /></div>
    {notice && <p className="table-notice table-notice-info cashier-screen-only" role="status">{notice}</p>}
    {error && <p className="table-notice table-notice-error cashier-screen-only" role="alert">{error}</p>}
    {loading && <p className="cashier-screen-only" role="status">Atualizando conta...</p>}
    {!order && !loading && <p>Nenhuma comanda ativa encontrada para esta mesa.</p>}
    {order && <>
      <p>{order.status === "closed" ? "Conta encerrada · Pagamento recebido" : order.status === "cancelled" ? "Comanda cancelada" : "Conta em aberto"}</p>
      {undelivered && unpaid && <p className="table-notice table-notice-info cashier-screen-only">Há itens ainda não entregues. Confira com o garçom antes de fechar a conta.</p>}
      <div className="bill-table-scroll"><table className="bill-table"><caption>Itens da comanda</caption><thead><tr><th scope="col">Produto</th><th scope="col">Qtd.</th><th scope="col">Unitário</th><th scope="col">Subtotal</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.products?.name ?? "Produto"}</strong>{item.notes && <p>{item.notes}</p>}<small className="cashier-screen-only">{statuses[item.status]}</small></td><td>{item.quantity}</td><td>{currency.format(item.unit_price)}</td><td>{currency.format(lineSubtotalInCents(item) / 100)}</td></tr>)}</tbody></table></div>
      {!items.length && <p>Nenhum item nesta comanda.</p>}
      {order.notes && <p>Observações: {order.notes}</p>}
      <p className="order-total">Total <strong>{currency.format(order.status === "closed" ? order.total_amount : total)}</strong></p>
      {!totalsMatch && <p className="table-notice table-notice-error cashier-screen-only" role="alert">Os totais estão sendo conferidos. Atualize a conta antes de continuar.</p>}
      {order.status === "closed" && <div className="receipt-summary"><p>Pagamento: {order.payment_method ? payments[order.payment_method] : "Não informado"}</p><p>Fechamento: {order.closed_at ? new Date(order.closed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informado"}</p><p>Comprovante de atendimento — sem valor fiscal.</p></div>}
      <div className="cashier-actions cashier-screen-only">
        {unpaid && <button className="primary-button" disabled={disabled} onClick={() => setConfirmation(fingerprint)}>Fechar conta</button>}
        {order.status === "closed" && <button className="primary-button" disabled={disabled} onClick={() => window.print()}>Imprimir comprovante</button>}
      </div>
    </>}
    <button className="ghost-button cashier-screen-only" disabled={busy || loading} onClick={() => void refresh()}>Atualizar conta</button>
    <dialog ref={dialog} className="bill-dialog" aria-labelledby="bill-confirmation-title" onCancel={(event) => { if (busy) event.preventDefault(); else setConfirmation(null); }} onClose={() => { if (!mutation.current) setConfirmation(null); }}>
      <h2 id="bill-confirmation-title">Confirmar fechamento</h2><p>Mesa {table.table_number} · Total {currency.format(total)}</p>
      {undelivered && <p className="table-notice table-notice-info">Ainda há itens não entregues. Confirme com o garçom.</p>}
      {staleConfirmation && <p role="alert">A conta foi alterada. Cancele e confira os itens novamente.</p>}
      <label className="field-group">Forma de pagamento<select className="order-input" value={payment} disabled={busy} onChange={(event) => setPayment(event.target.value as Payment)}>{(Object.keys(payments) as Payment[]).map((value) => <option key={value} value={value}>{payments[value]}</option>)}</select></label>
      <div className="cashier-actions"><button className="ghost-button" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button><button className="primary-button" disabled={disabled || staleConfirmation || !unpaid} onClick={() => void closeBill()}>{busy ? "Fechando..." : "Confirmar pagamento e fechar"}</button></div>
    </dialog>
  </section>;
}
