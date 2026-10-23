"use client";

import { useEffect, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";

import { money } from "./menu-cart";
import { CustomerApiError, customerApi } from "./public-client";

type TrackedOrder = { order_number: number; order_type: "pickup" | "delivery"; status: string; total_amount: number; delivery_fee: number; cancel_reason: string | null; estimated_minutes: number; items: { id: string; quantity: number; unit_price: number; products: { name: string } | null }[] };

export function OrderTracking({ token }: { token: string }) {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 5000;
      try {
        const data = await customerApi<TrackedOrder>(`/api/public/orders/${encodeURIComponent(token)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setOrder(data); setError("");
        if (["closed", "cancelled"].includes(data.status)) return;
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Não foi possível atualizar.");
        if (failure instanceof CustomerApiError && failure.status === 404) return;
        if (failure instanceof CustomerApiError && failure.status === 429) delay = 60000;
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, attempt]);
  const labels: Record<string, string> = { pending_confirmation: "Aguardando confirmação", open: "Em preparo", ready: order?.order_type === "delivery" ? "Pronto para entrega" : "Pronto para retirada", out_for_delivery: "Saiu para entrega", closed: "Concluído", cancelled: "Cancelado" };
  return <main className="customer-page"><header className="customer-header"><span className="eyebrow">Mesa Certa</span><h1>{order ? `Pedido #${order.order_number}` : "Acompanhe seu pedido"}</h1></header>{error && <p className="table-notice table-notice-error" role="alert">{error}</p>}{!order && !error && <p role="status">Carregando pedido...</p>}<button className="ghost-button" onClick={() => setAttempt((value) => value + 1)}>Atualizar acompanhamento</button>
    {order && <section className="order-panel"><OrderTypeBadge type={order.order_type} /><h2 role="status">{labels[order.status] ?? order.status}</h2>{order.status === "cancelled" && <p>Motivo: {order.cancel_reason ?? "Entre em contato com o restaurante."}</p>}{!["closed", "cancelled"].includes(order.status) && <p>Previsão aproximada informada: {order.estimated_minutes} minutos. O restaurante confirmará o atendimento.</p>}<ul className="sent-items">{order.items.map((item) => <li key={item.id}><strong>{item.quantity} × {item.products?.name ?? "Produto"}</strong><span>{money.format(Math.round(item.unit_price * 100) * item.quantity / 100)}</span></li>)}</ul><p>Taxa de entrega: {money.format(order.delivery_fee)}</p><p className="order-total">Total<strong>{money.format(order.total_amount)}</strong></p></section>}
  </main>;
}
