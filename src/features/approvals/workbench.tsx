"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { SensitiveActions } from "./sensitive-actions";
import { money } from "@/lib/money";
type Order = { id: string; order_number: number; counter_ticket: number | null; total_amount: number; payment_status: string; items: { id: string; name: string }[] };
export function ApprovalWorkbench() {
  const t = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]), [error, setError] = useState("");
  async function refresh() { try { const response = await fetch("/api/staff/approval-orders", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw Error(result.error); setOrders(result.filter((o: Order) => o.payment_status !== "paid")); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { let active = true; void fetch("/api/staff/approval-orders", {cache:"no-store"}).then(async r => { if(!r.ok) throw Error("Request failed"); return r.json(); }).then(r => {if(active)setOrders(r.filter((o: Order) => o.payment_status !== "paid"));}).catch(() => {if(active)setError("Falha de conexão.");}); return () => {active=false;}; }, []);
  return <section className="order-panel security-stack"><h2>{t("Pedidos para revisão")}</h2><button onClick={() => void refresh()}>{t("Atualizar")}</button>{error && <p role="alert">{t(error)}</p>}{orders.map(order => <article key={order.id}><h3>{order.counter_ticket != null ? `${t("Senha")} ${order.counter_ticket}` : `#${order.order_number}`}</h3><p>{money.format(order.total_amount)}</p><SensitiveActions orderId={order.id} items={order.items} onChanged={() => void refresh()} /></article>)}</section>;
}
