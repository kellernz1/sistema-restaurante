"use client";

import { useTranslation } from "@/components/language-provider";


import { useEffect, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";

import { money } from "./menu-cart";
import { CustomerApiError, customerApi } from "./public-client";

type TrackedOrder = { is_counter?:boolean; counter_ticket?:number; order_number: number; order_type: "dine_in" | "pickup" | "delivery"; status: string; total_amount: number; delivery_fee: number; cancel_reason: string | null; estimated_minutes: number; items: { id: string; quantity: number; unit_price: number; products: { name: string } | null }[] };

export function OrderTracking({ token }: { token: string }) {
  const t = useTranslation();
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
        setError(failure instanceof Error ? failure.message : t("Não foi possível atualizar."));
        if (failure instanceof CustomerApiError && failure.status === 404) return;
        if (failure instanceof CustomerApiError && failure.status === 429) delay = 60000;
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, attempt, t]);
  const labels: Record<string, string> = { pending_confirmation: t("Aguardando confirmação"), open: t("Em preparo"), ready: order?.order_type === "delivery" ? t("Pronto para entrega") : t("Pronto para retirada"), out_for_delivery: t("Saiu para entrega"), closed: t("Concluído"), cancelled: t("Cancelado") };
  if(order?.is_counter) return <main className="customer-page"><h1>{t("Senha {0}").replace("{0}", String(order.counter_ticket))}</h1><section className="order-panel"><h2 role="status">{t(labels[order.status] ?? order.status)}</h2></section>{error && <p role="alert">{error}</p>}<button className="ghost-button" onClick={() => setAttempt((value) => value+1)}>{t("Atualizar acompanhamento")}</button></main>;
  return <main className="customer-page"><header className="customer-header"><span className="eyebrow">Mesa Certa</span><h1>{t(order ? t(`Pedido #${order.order_number}`) : t("Acompanhe seu pedido"))}</h1></header>{error && <p className="table-notice table-notice-error" role="alert">{t(error)}</p>}{!order && !error && <p role="status">{t("Carregando pedido...")}</p>}<button className="ghost-button" onClick={() => setAttempt((value) => value + 1)}>{t("Atualizar acompanhamento")}</button>
    {order && <section className="order-panel"><OrderTypeBadge type={order.order_type} /><h2 role="status">{t(labels[order.status] ?? order.status)}</h2>{order.status === "cancelled" && <p>{t("Motivo: ")}{t(order.cancel_reason ?? t("Entre em contato com o restaurante."))}</p>}{!["closed", "cancelled"].includes(order.status) && <p>{t("Previsão aproximada informada: ")}{t(order.estimated_minutes)} {t(" minutos. O restaurante confirmará o atendimento.")}</p>}<ul className="sent-items">{order.items.map((item) => <li key={item.id}><strong>{item.quantity} × {item.products?.name ?? t("Produto")}</strong><span>{t(money.format(item.unit_price * item.quantity))}</span></li>)}</ul><p>{t("Taxa de entrega: ")}{t(money.format(order.delivery_fee))}</p><p className="order-total">{t("Total")}<strong>{t(money.format(order.total_amount))}</strong></p></section>}
  </main>;
}
