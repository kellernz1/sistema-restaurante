"use client";

import {
  Armchair,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";

import {
  type RestaurantTable,
  TABLE_STATUS_LABELS,
  type TableStatus,
} from "./table-status";

type TableGridProps = {
  initialTables: RestaurantTable[];
  initialLoadError: string | null;
};

type Notice = {
  tone: "error" | "info";
  message: string;
};

const TABLE_ACTION_LABELS: Record<TableStatus, string> = {
  available: "Abrir comanda",
  occupied: "Ver pedido ativo",
  closing: "Ver fechamento",
};

function sortTables(tables: RestaurantTable[]) {
  return [...tables].sort((first, second) => first.table_number - second.table_number);
}

function toRestaurantTable(value: Record<string, unknown>): RestaurantTable | null {
  if (
    typeof value.id !== "string" ||
    typeof value.table_number !== "number" ||
    typeof value.capacity !== "number" ||
    !["available", "occupied", "closing"].includes(String(value.status))
  ) {
    return null;
  }

  return {
    id: value.id,
    table_number: value.table_number,
    capacity: value.capacity,
    status: value.status as TableStatus,
  };
}

export function TableGrid({ initialTables, initialLoadError }: TableGridProps) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [tables, setTables] = useState(() => sortTables(initialTables));
  const [notice, setNotice] = useState<Notice | null>(
    initialLoadError ? { tone: "error", message: initialLoadError } : null,
  );
  const [openingTableId, setOpeningTableId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const openingTableIdRef = useRef<string | null>(null);

  const refreshTables = useCallback(async () => {
    setIsRefreshing(true);

    const { data, error } = await supabase
      .from("tables")
      .select("id, table_number, capacity, status")
      .order("table_number");

    if (error) {
      setNotice({
        tone: "error",
        message: "Não foi possível atualizar as mesas. Tente novamente.",
      });
    } else {
      setTables(data);
      setNotice(null);
    }

    setIsRefreshing(false);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("waiter-table-grid")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tables" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const removedId = payload.old.id;

            if (typeof removedId === "string") {
              setTables((current) =>
                current.filter((table) => table.id !== removedId),
              );
            }
            return;
          }

          const changedTable = toRestaurantTable(payload.new);

          if (!changedTable) {
            void refreshTables();
            return;
          }

          setTables((current) => {
            const otherTables = current.filter(
              (table) => table.id !== changedTable.id,
            );
            return sortTables([...otherTables, changedTable]);
          });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setNotice({
            tone: "info",
            message:
              "A atualização em tempo real foi interrompida. Atualize as mesas para conferir o salão.",
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshTables, supabase]);

  async function handleTableClick(table: RestaurantTable) {
    if (table.status !== "available") {
      router.push(`/waiter/tables/${table.id}`);
      return;
    }

    if (openingTableIdRef.current !== null) {
      return;
    }

    openingTableIdRef.current = table.id;
    setOpeningTableId(table.id);
    setNotice(null);

    const { error } = await supabase.rpc("open_table", {
      p_table_id: table.id,
    });

    if (error) {
      const isRaceCondition =
        error.code === "P0001" ||
        error.code === "23505" ||
        error.message.toLowerCase().includes("not available");
      await refreshTables();
      setNotice({
        tone: "error",
        message: isRaceCondition
          ? `A Mesa ${table.table_number} acabou de ser aberta por outro garçom. O mapa foi atualizado.`
          : "Não foi possível abrir esta mesa. Confira sua conexão e tente novamente.",
      });
      openingTableIdRef.current = null;
      setOpeningTableId(null);
      return;
    }

    setTables((current) =>
      current.map((currentTable) =>
        currentTable.id === table.id
          ? { ...currentTable, status: "occupied" }
          : currentTable,
      ),
    );
    router.push(`/waiter/tables/${table.id}`);
  }

  const tableCounts = tables.reduce<Record<TableStatus, number>>(
    (counts, table) => ({
      ...counts,
      [table.status]: counts[table.status] + 1,
    }),
    { available: 0, occupied: 0, closing: 0 },
  );

  return (
    <section className="table-dashboard">
      <div className="table-dashboard-heading">
        <div>
          <span className="eyebrow">Painel do garçom</span>
          <h1>Mapa de mesas</h1>
          <p>
            Abra uma mesa livre ou retome um atendimento em andamento. As
            mudanças do salão aparecem aqui em tempo real.
          </p>
        </div>

        <button
          className="ghost-button refresh-button"
          type="button"
          onClick={() => void refreshTables()}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <LoaderCircle className="spin" aria-hidden="true" size={17} />
          ) : (
            <RefreshCw aria-hidden="true" size={17} />
          )}
          Atualizar
        </button>
      </div>

      <div className="table-summary" aria-label="Resumo das mesas">
        {(Object.keys(TABLE_STATUS_LABELS) as TableStatus[]).map((status) => (
          <div className={`summary-item summary-${status}`} key={status}>
            <span>{TABLE_STATUS_LABELS[status]}</span>
            <strong>{tableCounts[status]}</strong>
          </div>
        ))}
      </div>

      {notice ? (
        <div
          className={`table-notice table-notice-${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <CircleAlert aria-hidden="true" size={19} />
          <span>{notice.message}</span>
        </div>
      ) : null}

      {tables.length === 0 ? (
        <div className="table-empty-state">
          <Armchair aria-hidden="true" size={32} />
          <strong>Nenhuma mesa encontrada</strong>
          <p>Execute o seed do Supabase ou tente atualizar novamente.</p>
        </div>
      ) : (
        <div className="table-grid">
          {tables.map((table) => {
            const isOpening = openingTableId === table.id;
            const isDisabled =
              openingTableId !== null && openingTableId !== table.id;

            return (
              <button
                className={`table-card table-card-${table.status}`}
                type="button"
                key={table.id}
                onClick={() => void handleTableClick(table)}
                disabled={isOpening || isDisabled}
                aria-busy={isOpening}
                aria-label={`Mesa ${table.table_number}, ${TABLE_STATUS_LABELS[table.status]}, capacidade para ${table.capacity} pessoas`}
              >
                <span className="table-card-topline">
                  <span className={`table-status-dot dot-${table.status}`} />
                  <span className={`table-status-label status-${table.status}`}>
                    {TABLE_STATUS_LABELS[table.status]}
                  </span>
                </span>

                <span className="table-number">
                  <small>Mesa</small>
                  {table.table_number}
                </span>

                <span className="table-capacity">
                  <Users aria-hidden="true" size={17} />
                  {table.capacity} {table.capacity === 1 ? "lugar" : "lugares"}
                </span>

                <span className="table-action">
                  {isOpening ? (
                    <>
                      <LoaderCircle className="spin" aria-hidden="true" size={16} />
                      Abrindo mesa...
                    </>
                  ) : (
                    TABLE_ACTION_LABELS[table.status]
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
