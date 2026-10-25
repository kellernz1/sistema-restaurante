"use client";

import { useTranslation } from "@/components/language-provider";


import { Clock, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";
import { createClient } from "@/utils/supabase/client";

import { kitchenQuery, type KitchenItem, type KitchenStatus } from "./kitchen-query";
import { uuid } from "@/lib/uuid";
import { groupKitchenOrders } from "./group-orders";

const columns: { status: KitchenStatus; title: string }[] = [
  { status: "pending", title: "Recebidos" },
  { status: "preparing", title: "Preparando" },
  { status: "ready", title: "Prontos" },
];

function ElapsedTime({ createdAt, now, warningMinutes }: {
  createdAt: string;
  now: number | null;
  warningMinutes: number;
}) {
  const t = useTranslation();
  const minutes = now === null ? null : Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60000));
  return (
    <span className={`kitchen-elapsed${minutes !== null && minutes >= warningMinutes ? " kitchen-overdue" : ""}`}>
      <Clock aria-hidden="true" size={15} />
      {t(minutes === null ? t("Calculando tempo...") : t(`${minutes} min de espera`))}
      {t(minutes !== null && minutes >= warningMinutes && t(" · Atenção"))}
    </span>
  );
}

export function KitchenBoard({ initialItems, initialError }: {
  initialItems: KitchenItem[];
  initialError: boolean;
}) {
  const t = useTranslation();
  const [supabase] = useState(createClient);
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState(initialError ? t("Não foi possível carregar a fila. Tente atualizar.") : "");
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const batchRequest = useRef<{ orderId: string; request_id: string; action: "start" | "ready" } | null>(null);
  const [uncertainBatch, setUncertainBatch] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [warningMinutes, setWarningMinutes] = useState(10);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const seenItems = useRef(new Set(initialItems.map((item) => item.id)));
  const pending = useRef(new Map<string, KitchenStatus>());
  const mounted = useRef(false);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++revision.current;
    setRefreshing(true);
    try {
      const result = await kitchenQuery(supabase);
      if (!mounted.current || version !== revision.current) return;
      if (result.error) throw result.error;
      const nextItems = result.data.map((item) => ({
        ...item,
        status: pending.current.get(item.id) ?? item.status,
      }));
      const hasNewPendingItem = nextItems.some(
        (item) => item.status === "pending" && !seenItems.current.has(item.id),
      );
      if (
        soundEnabled.current &&
        hasNewPendingItem &&
        audio.current?.state === "running"
      ) {
        const oscillator = audio.current.createOscillator();
        const gain = audio.current.createGain();
        gain.gain.value = 0.15;
        oscillator.frequency.value = 740;
        oscillator.connect(gain).connect(audio.current.destination);
        oscillator.start();
        oscillator.stop(audio.current.currentTime + 0.22);
      }
      seenItems.current = new Set(nextItems.map((item) => item.id));
      setItems(nextItems);
      setError("");
    } catch {
      if (mounted.current && version === revision.current) {
        setError(t("Não foi possível atualizar a fila. Confira sua conexão e tente novamente."));
      }
    } finally {
      if (mounted.current && version === revision.current) setRefreshing(false);
    }
  }, [supabase, t]);

  useEffect(() => {
    mounted.current = true;
    const update = () => { void refresh(); };
    const invalidate = () => { revision.current++; };
    // Refetch the joined result so order confirmation/cancellation and item changes agree.
    const channel = supabase.channel("kitchen-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, update)
      .subscribe((status) => {
        if (!mounted.current) return;
        if (status === "SUBSCRIBED") {
          setConnectionError("");
          update();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionError(t("Tempo real desconectado. Atualize a fila para conferir os pedidos."));
        }
      });
    update();
    const onVisible = () => { if (document.visibilityState === "visible") update(); };
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", update);
    return () => {
      mounted.current = false;
      invalidate();
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", update);
      void audio.current?.close();
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh, t]);

  async function toggleSound() {
    try {
      if (!audio.current || audio.current.state === "closed") {
        audio.current = new AudioContext();
      }
      await audio.current.resume();
      soundEnabled.current = !soundEnabled.current;
      setSound(soundEnabled.current);
    } catch {
      setNotice(t("Não foi possível ativar o som neste navegador."));
    }
  }

  async function advance(item: KitchenItem) {
    if (pending.current.has(item.id) || !["pending", "preparing"].includes(item.status)) return;
    const nextStatus = item.status === "pending" ? "preparing" : "ready";
    pending.current.set(item.id, nextStatus);
    setPendingIds([...pending.current.keys()]);
    setNotice("");
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: nextStatus } : row));
    try {
      const response = await fetch(`/api/staff/items/${item.id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected: item.status, status: nextStatus }),
      });
      if (!response.ok) throw new Error("Item changed");
      return true;
    } catch {
      if (mounted.current) {
        // Only restore an existing card: a cancelled order must not reappear.
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: item.status } : row));
        setNotice(t("Não foi possível alterar o item. Ele pode ter sido atualizado por outra pessoa. A fila será conferida novamente."));
      }
      return false;
    } finally {
      pending.current.delete(item.id);
      if (mounted.current) {
        setPendingIds([...pending.current.keys()]);
        await refresh();
      }
    }
  }

  async function submitBatch() {
    const request = batchRequest.current;
    if (!request || batchId) return;
    setBatchId(request.orderId);
    setNotice("");
    try {
      const response = await fetch(`/api/staff/orders/${request.orderId}/kitchen`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: request.request_id, action: request.action }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status >= 500) throw new Error("Uncertain batch");
        batchRequest.current = null;
        setUncertainBatch(false);
        setNotice(t("Pedido indisponível."));
      } else { batchRequest.current = null; setUncertainBatch(false); }
    } catch {
      setUncertainBatch(true);
      setNotice(t("Não foi possível confirmar a ação. Consulte o envio antes de continuar."));
    } finally {
      await refresh();
      setBatchId(null);
    }
  }
  async function advanceOrder(rows: KitchenItem[], finish: boolean) {
    if (batchRequest.current || batchId || rows.some((item) => pending.current.has(item.id))) return;
    batchRequest.current = { orderId: rows[0].orders.id, request_id: uuid(), action: finish ? "ready" : "start" };
    await submitBatch();
  }
  const groupedOrders = groupKitchenOrders(items);

  return (
    <section className="kitchen-dashboard">
      <div className="table-dashboard-heading">
        <div><span className="eyebrow">{t("Painel da cozinha")}</span><h1>{t("Fila de preparo")}</h1>
          <p>{t("Pedidos abertos em tempo real. Comece pelos itens com maior tempo de espera.")}</p></div>
        <div className="cashier-actions">
          <button className="ghost-button" aria-pressed={sound} onClick={() => void toggleSound()}>
            {sound ? <Volume2 aria-hidden="true" size={17} /> : <VolumeX aria-hidden="true" size={17} />}
            {t(sound ? t("Desativar som") : t("Ativar som"))}
          </button>
          <button className="ghost-button refresh-button" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" size={17} className={refreshing ? "spin" : ""} />
            {t(refreshing ? t("Atualizando...") : t("Atualizar fila"))}
          </button>
        </div>
      </div>
      {uncertainBatch && <button className="primary-button" disabled={!!batchId} onClick={() => void submitBatch()}>{t("Consultar envio")}</button>}
      <label className="kitchen-threshold">{t("Alertar após")}<select value={warningMinutes} onChange={(event) => setWarningMinutes(Number(event.target.value))}>
          {[5, 10, 15, 20, 30].map((value) => <option value={value} key={value}>{t(value)} {t(" minutos")}</option>)}
        </select>
      </label>
      {(error || connectionError) && <p className="table-notice table-notice-error" role="alert">{t(error || connectionError)}</p>}
      {notice && <p className="table-notice table-notice-error" role="alert">{t(notice)}</p>}
      <div className="kitchen-columns" aria-label={t("Fila de produção")} aria-busy={refreshing}>
        {columns.map((column) => {
          const columnItems = groupedOrders.filter((group) => group.status === column.status);
          return <section className={`kitchen-column kitchen-column-${column.status}`} key={column.status}>
            <h2>{t(column.title)}<span aria-label={t(`${columnItems.length} pedidos`)}>{t(columnItems.length)}</span></h2>
            {!columnItems.length && <p className="kitchen-empty">{t(error ? t("Atualize para conferir esta coluna.") : t("Nenhum item nesta etapa."))}</p>}
            {columnItems.map((group) => {
              const order = group.items[0].orders;
              const isPending = batchId === group.id || group.items.some((item) => pendingIds.includes(item.id));
              return <article className="kitchen-card" key={group.id} aria-busy={isPending}>
                <div className="kitchen-card-heading"><OrderTypeBadge type={order.order_type} /><span>{order.is_counter ? t("Senha {0}").replace("{0}", String(order.counter_ticket)) : `#${order.order_number}`}</span></div>
                <h3>{order.order_type === "dine_in"
                  ? t(`Mesa ${order.tables?.table_number ?? t("não informada")}`)
                  : order.counter_name || order.customer_name?.trim().split(/\s+/)[0] || t("Cliente")}</h3>
                <ul className="kitchen-order-items">{group.items.map((item) => <li key={item.id}>
                  <p className="kitchen-product"><strong>{item.quantity} ×</strong> {item.products?.name ?? t("Produto indisponível")}</p>
                  {item.notes && <p className="kitchen-notes"><strong>{t("Observações:")}</strong> {item.notes}</p>}
                  <span className="kitchen-item-status">{t(item.status === "ready" ? "Pronto" : item.status === "preparing" ? "Preparando" : "Recebido")}</span>
                  {item.status !== "ready" && <button className="ghost-button" disabled={isPending || !!batchId || uncertainBatch || !!error} onClick={() => void advance(item)}>{t(item.status === "pending" ? "Iniciar preparo" : "Marcar pronto")}</button>}
                </li>)}</ul>
                {column.status !== "ready" && <ElapsedTime createdAt={group.createdAt} now={now} warningMinutes={warningMinutes} />}
                {column.status !== "ready" && <button className="primary-button" disabled={isPending || !!batchId || !!error} onClick={() => void advanceOrder(group.items, column.status === "preparing")}>
                  {t(isPending ? "Salvando..." : column.status === "pending" ? "Iniciar pedido" : "Marcar tudo como pronto")}
                </button>}
              </article>;
            })}
          </section>;
        })}
      </div>
    </section>
  );
}
