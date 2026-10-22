import { ArrowLeft, ClipboardList, Users } from "lucide-react";
import Link from "next/link";

import { TABLE_STATUS_LABELS } from "@/features/tables/table-status";
import { createClient } from "@/utils/supabase/server";

type TablePageProps = {
  params: Promise<{ tableId: string }>;
};

export default async function WaiterTablePage({ params }: TablePageProps) {
  const { tableId } = await params;
  const supabase = await createClient();
  const [{ data: table, error: tableError }, { data: order }] =
    await Promise.all([
      supabase
        .from("tables")
        .select("id, table_number, capacity, status")
        .eq("id", tableId)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id, order_number, status, created_at")
        .eq("table_id", tableId)
        .not("status", "in", '("closed","cancelled")')
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (tableError || !table) {
    return (
      <section className="table-detail-state">
        <span className="placeholder-icon danger-icon">
          <ClipboardList aria-hidden="true" size={25} />
        </span>
        <span className="eyebrow">Mesa não encontrada</span>
        <h1>Não foi possível abrir este atendimento</h1>
        <p>Volte ao mapa e escolha uma mesa disponível.</p>
        <Link className="primary-button compact-button" href="/waiter">
          <ArrowLeft aria-hidden="true" size={17} />
          Voltar ao mapa
        </Link>
      </section>
    );
  }

  return (
    <section className="table-detail-state">
      <Link className="back-link" href="/waiter">
        <ArrowLeft aria-hidden="true" size={17} />
        Mapa de mesas
      </Link>

      <div className="table-detail-heading">
        <div>
          <span className="eyebrow">Atendimento em andamento</span>
          <h1>Mesa {table.table_number}</h1>
        </div>
        <span className={`table-status-label status-${table.status}`}>
          {TABLE_STATUS_LABELS[table.status]}
        </span>
      </div>

      <div className="table-detail-card">
        <span className="placeholder-icon">
          <ClipboardList aria-hidden="true" size={25} />
        </span>
        <div>
          <strong>
            {order ? `Comanda #${order.order_number}` : "Comanda da mesa"}
          </strong>
          <p>
            Os produtos, o carrinho e os itens enviados serão adicionados na
            Fase 5.
          </p>
        </div>
        <span className="table-capacity">
          <Users aria-hidden="true" size={17} />
          {table.capacity} {table.capacity === 1 ? "lugar" : "lugares"}
        </span>
      </div>
    </section>
  );
}
