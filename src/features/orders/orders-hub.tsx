"use client";

import { useTranslation } from "@/components/language-provider";


import { useCallback, useEffect, useRef, useState } from "react";

import { ArrowButton, PillButton, SegmentedControl, StatusPill } from "@/components/ui";
import { PaymentPanel } from "@/features/payments/payment-panel";
import { OrderDetails } from "./order-details";
import { ManualPrintButton } from "@/features/kitchen/manual-print-button";

import { OrderTypeBadge } from "@/components/order-type-badge";
import { money } from "@/features/customer-ordering/menu-cart";
import { mapLinkSchema } from "@/features/customer-ordering/delivery-location";
import { customerApi } from "@/features/customer-ordering/public-client";
import { useAuth } from "@/features/auth/auth-provider";
import { HumanHandoffs } from "@/features/whatsapp/human-handoffs";
import { createClient } from "@/utils/supabase/client";

import { hubQuery, type HubOrder } from "./hub-query";

const labels: Record<string, string> = { pending_confirmation: "Aguardando confirmação", open: "Em preparo", ready: "Pronto", out_for_delivery: "Saiu para entrega", closed: "Concluído", cancelled: "Cancelado" };
const sourceLabels: Record<HubOrder["source"], string> = { waiter: "Equipe", qr: "QR code", nfc: "NFC", whatsapp: "WhatsApp", web: "Site" };
function addressText(order: HubOrder) {
  const address = order.delivery_address;
  if (!address || typeof address !== "object" || Array.isArray(address)) return "";
  return ["street", "number", "complement", "neighborhood", "city", "state", "zip_code", "reference"].map((key) => typeof address[key] === "string" ? address[key] : "").filter(Boolean).join(", ");
}

function deliveryMapLink(order: HubOrder) {
  const address = order.delivery_address;
  const link = mapLinkSchema.safeParse(address && typeof address === "object" && !Array.isArray(address) ? address.location_url : undefined);
  return link.success ? link.data : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText(order))}`;
}

function deliveryDistance(order: HubOrder) {
  const address = order.delivery_address;
  const meters = address && typeof address === "object" && !Array.isArray(address) ? address.delivery_distance_meters : null;
  return typeof meters === "number" && Number.isFinite(meters) && meters >= 0 ? `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} km pela rota` : null;
}

export function OrdersHub({ initialOrders, initialError }: { initialOrders: HubOrder[]; initialError: boolean }) {
  const t = useTranslation();
  const { role } = useAuth();
  const writable = role === "cashier" || role === "admin";
  const [db] = useState(createClient);
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(initialError ? t("Não foi possível carregar os pedidos.") : "");
  const [notice, setNotice] = useState("");
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const seenPending = useRef(new Set(initialOrders.filter((order) => order.status === "pending_confirmation").map((order) => order.id)));
  const revision = useRef(0);
  const lock = useRef(false);

  const refresh = useCallback(async () => {
    const version = ++revision.current;
    setRefreshing(true);
    try {
      const result = await hubQuery(db);
      if (version !== revision.current) return;
      if (result.error) throw result.error;
      const pending = result.data.filter((order) => order.status === "pending_confirmation");
      if (soundEnabled.current && pending.some((order) => !seenPending.current.has(order.id)) && audio.current?.state === "running") {
        const oscillator = audio.current.createOscillator();
        const gain = audio.current.createGain();
        gain.gain.value = 0.15;
        oscillator.frequency.value = 660;
        oscillator.connect(gain).connect(audio.current.destination);
        oscillator.start(); oscillator.stop(audio.current.currentTime + 0.2);
      }
      seenPending.current = new Set(pending.map((order) => order.id));
      setOrders(result.data); setError("");
    } catch { if (version === revision.current) setError(t("Não foi possível atualizar a central. Confira a conexão e tente novamente.")); }
    finally { if (version === revision.current) setRefreshing(false); }
  }, [db, t]);

  useEffect(() => {
    let alive = true;
    const invalidate = () => { revision.current++; };
    const update = () => { if (alive) void refresh(); };
    const channel = db.channel("orders-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, update)
      .subscribe((status) => {
        if (!alive) return;
        if (status === "SUBSCRIBED") update();
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setError(t("Tempo real indisponível. Use Atualizar pedidos."));
      });
    update();
    const visible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", visible); window.addEventListener("online", update);
    return () => { alive = false; invalidate(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", update); void db.removeChannel(channel); };
  }, [db, refresh, t]);
  useEffect(() => { const closeAudio = () => { void audio.current?.close(); }; return closeAudio; }, []);

  async function toggleSound() {
    try {
      if (!audio.current || audio.current.state === "closed") audio.current = new AudioContext();
      await audio.current.resume();
      soundEnabled.current = !soundEnabled.current; setSound(soundEnabled.current);
    } catch { setNotice(t("Não foi possível ativar o som neste navegador.")); }
  }

  async function act(order: HubOrder, action: string) {
    if (lock.current || !writable) return;
    const reason = action === "reject" ? window.prompt(t("Informe o motivo da recusa:"))?.trim() : undefined;
    if (action === "reject" && !reason) return;
    if (action === "ready" && order.order_items.some((item) => !["ready", "delivered"].includes(item.status)) && !window.confirm(t("Há itens que ainda não estão prontos. Deseja marcar o pedido inteiro como pronto?"))) return;
    if (action === "complete" && !window.confirm(t(`Confirmar recebimento e concluir o pedido #${order.order_number}?`))) return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      await customerApi(`/api/staff/orders/${order.id}/transition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason, ...(action === "complete" ? { payment_method: "cash" } : {}) }) });
      setNotice(t("Pedido atualizado."));
    } catch (failure) { setNotice(failure instanceof Error ? failure.message : t("Não foi possível atualizar o pedido.")); }
    finally { await refresh(); setBusy(false); lock.current = false; }
  }

  const visible = orders.filter((order) => filter === "all" || order.order_type === filter);
  const pending = visible.filter((order) => order.status === "pending_confirmation");
  const others = visible.filter((order) => order.status !== "pending_confirmation");
  const selected = orders.find((order) => order.id === selectedId);
  const closeDetails = useCallback(() => setSelectedId(null), []);
  const selectOrder = (order: HubOrder) => { setSelectedId(order.id); };
  const renderCard = (order: HubOrder) => <article className={`hub-card hub-type-${order.order_type}`} key={order.id} data-selected={selectedId === order.id}>
    <div className="hub-card-top"><OrderTypeBadge type={order.order_type} /><OrderAge createdAt={order.created_at} closedAt={order.closed_at} /></div>
    <div className="hub-card-main"><strong>{order.is_counter ? t("Senha {0}").replace("{0}",String(order.counter_ticket)) : `#${order.order_number}`} {order.order_type === "dine_in" ? t(`· Mesa ${order.tables?.table_number}`) : `· ${order.customer_name ?? t("Cliente")}`}</strong><span className="hub-price">{t(money.format(order.total_amount))}</span></div>
    <StatusPill tone={order.status} className={`hub-order-status hub-status-${order.status}`}>{t(labels[order.status])}</StatusPill>
    <div className="hub-card-actions">{writable && order.status === "pending_confirmation" && <PillButton disabled={busy || !!error} onClick={() => void act(order, "accept")}>{t("Confirmar")}</PillButton>}
      <ArrowButton aria-pressed={selectedId === order.id} onClick={() => selectOrder(order)} aria-label={t(`Detalhes do pedido #${order.order_number}`)}>{t("Detalhes")}</ArrowButton></div>
  </article>;

  return <section className="orders-hub"><header className="table-dashboard-heading orders-screen-only"><div><span className="eyebrow">{t("Operação")}</span><h1>{t("Central de pedidos")}</h1><p>{t("Até 200 pedidos, priorizando os ativos. ")}{t(writable ? t("Confirme e acompanhe cada atendimento.") : t("Acesso de consulta; alterações são feitas pelo caixa."))}</p></div><ArrowButton disabled={refreshing} onClick={() => void refresh()}>{t(refreshing ? t("Atualizando...") : t("Atualizar"))}</ArrowButton></header>
    <HumanHandoffs />{error && <p className="table-notice table-notice-error orders-screen-only" role="alert">{t(error)}</p>}{notice && <p className="table-notice table-notice-info orders-screen-only" role="status">{t(notice)}</p>}
    <div className="cashier-actions hub-toolbar orders-screen-only">
      <SegmentedControl label={t("Filtrar pedidos por canal")} value={filter} onChange={setFilter} options={[
        { value: "all", label: t("Todos"), count: orders.length },
        { value: "dine_in", label: t("Local"), count: orders.filter((order) => order.order_type === "dine_in").length },
        { value: "pickup", label: t("Retirada"), count: orders.filter((order) => order.order_type === "pickup").length },
        { value: "delivery", label: t("Entrega"), count: orders.filter((order) => order.order_type === "delivery").length },
      ]} />
      <ArrowButton aria-pressed={sound} onClick={() => void toggleSound()}>{t(sound ? t("Desativar som") : t("Ativar som"))}</ArrowButton>
    </div>
    <div className="hub-layout"><div className="orders-screen-only"><h2>{t("Novos pedidos ")}<span className="status-pill" aria-live="polite">{t(pending.length)}</span></h2><div className="hub-cards">{t(pending.map(renderCard))}</div>{!pending.length && <p>{t("Nenhum pedido aguardando confirmação.")}</p>}<h2>{t("Em acompanhamento")}</h2><div className="hub-cards">{t(others.map(renderCard))}</div>{!others.length && <p>{t("Nenhum pedido neste filtro.")}</p>}</div>
      {selected ? <OrderDetails key={selected.id} onClose={closeDetails}><div className="table-detail-heading"><h2>{selected.is_counter ? t("Senha {0}").replace("{0}",String(selected.counter_ticket)) : `${t("Pedido #")}${selected.order_number}`}</h2><OrderTypeBadge type={selected.order_type} /></div><p>{t(labels[selected.status])} {t(" · Origem: ")}{t(sourceLabels[selected.source])}</p>
        {selected.is_counter ? <p>{selected.counter_name ?? t("Balcão")}</p> : selected.order_type === "dine_in" ? <p>{t("Mesa ")}{selected.tables?.table_number}</p> : <><p>{t("Cliente: ")}{selected.customer_name}</p><p>{t("Telefone: ")}{selected.customer_phone}</p><div className="cashier-actions orders-screen-only"><a className="back-link" href={`tel:${selected.customer_phone ?? ""}`}>{t("Ligar")}</a><a className="back-link" target="_blank" rel="noreferrer" href={`https://wa.me/${selected.customer_phone?.replace(/\D/g, "") ?? ""}`}>{t("Abrir WhatsApp")}</a></div></>}
        {selected.order_type === "delivery" && <><p>{t("Endereço: ")}{addressText(selected) || t("Localização enviada pelo cliente")}</p>{deliveryDistance(selected) && <p>{t("Distância de entrega: ")}{t(deliveryDistance(selected))}</p>}<a className="back-link orders-screen-only" target="_blank" rel="noreferrer" href={deliveryMapLink(selected)}>{t("Abrir no mapa")}</a></>}
        <ul className="sent-items">{selected.order_items.map((item) => <li key={item.id}><div><strong>{item.quantity} × {item.products?.name ?? t("Produto")}</strong>{item.notes && <p>{t("Observações: ")}{item.notes}</p>}<p>{t(money.format(item.unit_price))} {t(" por unidade")}</p></div><span>{t(money.format(item.unit_price * item.quantity))}</span></li>)}</ul>
        {selected.notes && <p>{t("Observações do pedido: ")}{selected.notes}</p>}<p>{t("Taxa de entrega: ")}{t(money.format(selected.delivery_fee))}</p>{selected.cash_change_for !== null && <p>{t("Troco para: ")}{t(money.format(selected.cash_change_for))} {t(" · Troco: ")}{t(money.format(Math.max(0, selected.cash_change_for - selected.total_amount)))}</p>}<p className="order-total">{t("Total")}<strong>{t(money.format(selected.total_amount))}</strong></p><p>{selected.is_counter && <strong>{t("Senha {0}").replace("{0}", String(selected.counter_ticket))}{selected.counter_name ? ` · ${selected.counter_name}` : ""} · </strong>}{t("Pagamento: ")}{t(selected.payment_method === "cash" ? t("Dinheiro") : selected.payment_method === "transfer" ? t("Transferência") : selected.payment_method === "card" ? t("Cartão") : selected.payment_method === "pix" ? t("Pix") : t("A definir"))} · {t(selected.payment_status === "paid" ? t("Recebido") : t("Pendente"))}</p>{selected.cancel_reason && <p>{t("Motivo da recusa: ")}{t(selected.cancel_reason)}</p>}
        {writable && selected.status === "closed" && <PaymentPanel key={selected.id} orderId={selected.id} total={selected.total_amount} closed onRecorded={refresh} />}<div className="cashier-actions hub-ticket-actions orders-screen-only"><button className="ghost-button" onClick={() => window.print()}>{t("Imprimir pedido")}</button><ManualPrintButton orderId={selected.id} />
          {writable && <>{selected.status === "pending_confirmation" && <><button className="primary-button" disabled={busy || !!error} onClick={() => void act(selected, "accept")}>{t("Aceitar")}</button><button className="ghost-button" disabled={busy || !!error} onClick={() => void act(selected, "reject")}>{t("Recusar com motivo")}</button></>}{!selected.is_counter && selected.order_type !== "dine_in" && selected.status === "open" && <button className="primary-button" disabled={busy || !!error} onClick={() => void act(selected, "ready")}>{t("Marcar pronto")}</button>}{selected.order_type === "delivery" && selected.status === "ready" && <button className="primary-button" disabled={busy || !!error} onClick={() => void act(selected, "dispatch")}>{t("Saiu para entrega")}</button>}{(!selected.is_counter && (selected.order_type === "pickup" && selected.status === "ready") || (selected.order_type === "delivery" && selected.status === "out_for_delivery")) && <><PaymentPanel key={selected.id} orderId={selected.id} total={selected.total_amount} closed={false} onRecorded={refresh} /></>}</>}
        </div>
      </OrderDetails> : <div className="table-empty-state orders-screen-only"><strong>{t("Selecione um pedido")}</strong><p>{t("Confira os itens e o atendimento aqui.")}</p></div>}
    </div>
  </section>;
}

function OrderAge({ createdAt, closedAt }: { createdAt: string; closedAt: string | null }) {
  const t = useTranslation();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update(); const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes = now === null ? null : Math.max(0, Math.floor(((closedAt ? new Date(closedAt).getTime() : now) - new Date(createdAt).getTime()) / 60000));
  return <time className="hub-elapsed" dateTime={createdAt}>{t(minutes === null ? "—" : `${closedAt ? t("Duração: ") : t("Há ")}${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`}`)}</time>;
}
