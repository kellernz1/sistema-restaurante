"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { TABLE_STATUS_LABELS } from "@/features/tables/table-status";
import { createClient } from "@/utils/supabase/client";

import { BillDetail } from "./bill-detail";
import { cashierTablesQuery, type CashierTable } from "./cashier-query";

export function CashierBoard({ initialTables, initialError }: {
  initialTables: CashierTable[];
  initialError: boolean;
}) {
  const [db] = useState(createClient);
  const [tables, setTables] = useState(initialTables);
  const [selected, setSelected] = useState<CashierTable | null>(null);
  const [error, setError] = useState(initialError ? "Não foi possível carregar as mesas." : "");
  const [connectionError, setConnectionError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    try {
      const result = await cashierTablesQuery(db);
      if (version !== generation.current) return;
      if (result.error) throw result.error;
      setTables(result.data);
      setError("");
    } catch {
      if (version === generation.current) setError("Não foi possível atualizar as mesas. Tente novamente.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    let alive = true;
    const invalidate = () => { generation.current++; };
    const update = () => { if (alive) void refresh(); };
    const channel = db.channel("cashier-tables")
      .on("postgres_changes", { event: "*", schema: "public", table: "tables" }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, update)
      .subscribe((status) => {
        if (!alive) return;
        if (status === "SUBSCRIBED") { setConnectionError(""); update(); }
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          setConnectionError("Tempo real indisponível. Use Atualizar mesas para conferir o salão.");
        }
      });
    update();
    const visible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", update);
    return () => {
      alive = false;
      invalidate();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", update);
      void db.removeChannel(channel);
    };
  }, [db, refresh]);

  const sorted = [...tables].sort((a, b) => Number(b.status === "closing") - Number(a.status === "closing") || a.table_number - b.table_number);
  return <section className="cashier-dashboard">
    <div className="table-dashboard-heading cashier-screen-only"><div><span className="eyebrow">Painel do caixa</span>
      <h1>Fechamento de contas</h1><p>Mesas aguardando a conta aparecem primeiro. Selecione uma mesa para conferir a comanda.</p></div>
      <div className="cashier-actions"><Link className="primary-button" href="/cashier/orders/new">Novo pedido</Link><button className="ghost-button" disabled={loading} onClick={() => void refresh()}>{loading ? "Atualizando..." : "Atualizar mesas"}</button></div></div>
    {(error || connectionError) && <p className="table-notice table-notice-error cashier-screen-only" role="alert">{error || connectionError}</p>}
    <div className="cashier-layout">
      <section className="cashier-table-list cashier-screen-only" aria-label="Mesas com atendimento ativo" aria-busy={loading}>
        {!sorted.length && <p>{error ? "Atualize para conferir as mesas." : "Nenhuma mesa aguardando pagamento."}</p>}
        {sorted.map((table) => <button key={table.id} className={`cashier-table table-card-${table.status}`} aria-pressed={selected?.id === table.id}
          onClick={() => setSelected(table)}><strong>Mesa {table.table_number}</strong><span className={`table-status-label status-${table.status}`}>{TABLE_STATUS_LABELS[table.status]}</span></button>)}
      </section>
      {selected ? <BillDetail key={selected.id} table={selected} onClosed={refresh} />
        : <div className="table-empty-state cashier-screen-only"><strong>Selecione uma mesa</strong><p>Os itens e as opções de pagamento aparecerão aqui.</p></div>}
    </div>
  </section>;
}
