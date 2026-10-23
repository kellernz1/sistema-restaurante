"use client";

import { Clock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";
import { createClient } from "@/utils/supabase/client";

import { kitchenQuery, type KitchenItem, type KitchenStatus } from "./kitchen-query";

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
  const minutes = now === null ? null : Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60000));
  return (
    <span className={`kitchen-elapsed${minutes !== null && minutes >= warningMinutes ? " kitchen-overdue" : ""}`}>
      <Clock aria-hidden="true" size={15} />
      {minutes === null ? "Calculando tempo..." : `${minutes} min de espera`}
      {minutes !== null && minutes >= warningMinutes && " · Atenção"}
    </span>
  );
}

export function KitchenBoard({ initialItems, initialError }: {
  initialItems: KitchenItem[];
  initialError: boolean;
}) {
  const [supabase] = useState(createClient);
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState(initialError ? "Não foi possível carregar a fila. Tente atualizar." : "");
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [warningMinutes, setWarningMinutes] = useState(10);
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
      setItems(result.data.map((item) => ({
        ...item,
        status: pending.current.get(item.id) ?? item.status,
      })));
      setError("");
    } catch {
      if (mounted.current && version === revision.current) {
        setError("Não foi possível atualizar a fila. Confira sua conexão e tente novamente.");
      }
    } finally {
      if (mounted.current && version === revision.current) setRefreshing(false);
    }
  }, [supabase]);

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
          setConnectionError("Tempo real desconectado. Atualize a fila para conferir os pedidos.");
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
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  async function advance(item: KitchenItem) {
    if (pending.current.has(item.id) || !["pending", "preparing"].includes(item.status)) return;
    const nextStatus = item.status === "pending" ? "preparing" : "ready";
    pending.current.set(item.id, nextStatus);
    setPendingIds([...pending.current.keys()]);
    setNotice("");
    setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: nextStatus } : row));
    try {
      const { data, error: mutationError } = await supabase.from("order_items")
        .update({ status: nextStatus }).eq("id", item.id).eq("status", item.status).select("id");
      if (mutationError || !data?.length) throw mutationError ?? new Error("Item changed");
    } catch {
      if (mounted.current) {
        // Only restore an existing card: a cancelled order must not reappear.
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: item.status } : row));
        setNotice("Não foi possível alterar o item. Ele pode ter sido atualizado por outra pessoa. A fila será conferida novamente.");
      }
    } finally {
      pending.current.delete(item.id);
      if (mounted.current) {
        setPendingIds([...pending.current.keys()]);
        await refresh();
      }
    }
  }

  return (
    <section className="kitchen-dashboard">
      <div className="table-dashboard-heading">
        <div><span className="eyebrow">Painel da cozinha</span><h1>Fila de preparo</h1>
          <p>Pedidos abertos em tempo real. Comece pelos itens com maior tempo de espera.</p></div>
        <button className="ghost-button refresh-button" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw aria-hidden="true" size={17} className={refreshing ? "spin" : ""} />
          {refreshing ? "Atualizando..." : "Atualizar fila"}
        </button>
      </div>
      <label className="kitchen-threshold">Alertar após
        <select value={warningMinutes} onChange={(event) => setWarningMinutes(Number(event.target.value))}>
          {[5, 10, 15, 20, 30].map((value) => <option value={value} key={value}>{value} minutos</option>)}
        </select>
      </label>
      {(error || connectionError) && <p className="table-notice table-notice-error" role="alert">{error || connectionError}</p>}
      {notice && <p className="table-notice table-notice-error" role="alert">{notice}</p>}
      <div className="kitchen-columns" aria-label="Fila de produção" aria-busy={refreshing}>
        {columns.map((column) => {
          const columnItems = items.filter((item) => item.status === column.status);
          return <section className={`kitchen-column kitchen-column-${column.status}`} key={column.status}>
            <h2>{column.title}<span aria-label={`${columnItems.length} itens`}>{columnItems.length}</span></h2>
            {!columnItems.length && <p className="kitchen-empty">{error ? "Atualize para conferir esta coluna." : "Nenhum item nesta etapa."}</p>}
            {columnItems.map((item) => {
              const order = item.orders;
              const isPending = pendingIds.includes(item.id);
              return <article className="kitchen-card" key={item.id} aria-busy={isPending}>
                <div className="kitchen-card-heading"><OrderTypeBadge type={order.order_type} /><span>#{order.order_number}</span></div>
                <h3>{order.order_type === "dine_in"
                  ? `Mesa ${order.tables?.table_number ?? "não informada"}`
                  : order.customer_name?.trim().split(/\s+/)[0] || "Cliente"}</h3>
                <p className="kitchen-product"><strong>{item.quantity} ×</strong> {item.products?.name ?? "Produto indisponível"}</p>
                {item.notes && <p className="kitchen-notes"><strong>Observações:</strong> {item.notes}</p>}
                <ElapsedTime createdAt={item.created_at} now={now} warningMinutes={warningMinutes} />
                {column.status !== "ready" && <button className="primary-button" disabled={isPending || !!error} onClick={() => void advance(item)}
                  aria-label={`${column.status === "pending" ? "Iniciar preparo" : "Marcar pronto"}: ${item.products?.name ?? "item"}, pedido ${order.order_number}`}>
                  {isPending ? "Salvando..." : column.status === "pending" ? "Iniciar preparo" : "Marcar pronto"}
                </button>}
              </article>;
            })}
          </section>;
        })}
      </div>
    </section>
  );
}
