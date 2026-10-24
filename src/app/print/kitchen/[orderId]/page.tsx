import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ManualPrintButton } from "@/features/kitchen/manual-print-button";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError } from "@/lib/public-table-api";
import "./receipt.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comanda da cozinha", robots: { index: false, follow: false } };

export default async function KitchenTicketPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { db } = await requireStaff(["admin", "cashier", "kitchen", "waiter"]).catch((error) => {
    if (error instanceof PublicApiError && error.status === 401) redirect("/login");
    if (error instanceof PublicApiError && error.status === 403) redirect("/unauthorized");
    throw error;
  });
  const id = z.uuid().safeParse((await params).orderId);
  if (!id.success) notFound();
  const result = await db.from("orders").select("id,order_number,order_type,customer_name,status,notes,created_at,tables(table_number),order_items(id,quantity,notes,created_at,products(name))").eq("id", id.data).single();
  if (result.error || !result.data) notFound();
  const order = result.data;
  const types = { dine_in: "LOCAL", pickup: "RETIRADA", delivery: "ENTREGA" };
  return <main className="kitchen-receipt" data-kitchen-ticket={order.id}>
    <div className="kitchen-receipt-controls"><ManualPrintButton orderId={order.id} /><p>Para testar sem impressora, selecione Salvar como PDF na janela de impressão.</p></div>
    <header><p>COZINHA · MESA CERTA</p><h1>Pedido #{order.order_number}</h1><strong>{types[order.order_type]}{order.tables ? ` · Mesa ${order.tables.table_number}` : ""}</strong>
      {order.customer_name && <p>Cliente: {order.customer_name}</p>}<p>{new Date(order.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>{order.status === "cancelled" && <h2>PEDIDO CANCELADO</h2>}
    </header>
    <section aria-label="Itens para preparo">{[...order.order_items].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((item) => <article key={item.id}><h2>{item.quantity} × {item.products?.name ?? "Produto"}</h2>{item.notes && <p className="kitchen-receipt-notes">OBS.: {item.notes}</p>}</article>)}</section>
    {order.notes && <footer><strong>Observações do pedido</strong><p>{order.notes}</p></footer>}
  </main>;
}
