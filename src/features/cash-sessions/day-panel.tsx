"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useTranslation} from "@/components/language-provider";
import {customerApi} from "@/features/customer-ordering/public-client";
import {money} from "@/lib/money";
import {PaymentSummary} from "./report-view";
import type {CashDayReport} from "./types";
export function CashDayPanel(){
 const t=useTranslation();const [day,setDay]=useState(""),[data,setData]=useState<CashDayReport|null>(null),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();void customerApi<CashDayReport>(`/api/staff/cash-reports${day?`?day=${day}`:""}`,{signal:controller.signal}).then(v=>{setData(v);setError("");if(!day)setDay(v.day);}).catch(()=>{if(!controller.signal.aborted)setError(t("Relatório indisponível."));});return()=>controller.abort();},[day,t]);
 return <section className="cash-sessions"><header className="section-heading"><h1>{t("Relatório do dia comercial")}</h1><Link className="back-link" href="/cashier/sessions">{t("Turnos de caixa")}</Link></header><label>{t("Dia comercial")}<input className="order-input" type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}
 {data&&<><section className="order-panel"><PaymentSummary value={data.payments}/><p>{t("Ticket médio")}: {money.format(data.average_ticket)}</p></section><section className="order-panel"><h2>{t("Produtos mais vendidos")}</h2>{data.products.map(p=><p key={p.product_id}>{p.quantity} × {p.name} · {money.format(p.amount)}</p>)}</section><section className="order-panel"><h2>{t("Recebimentos por hora")}</h2>{data.hours.map(h=><p key={h.hour}>{new Date(h.hour).toLocaleString(undefined,{timeZone:data.timezone,hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",timeZoneName:"shortOffset"})} · {money.format(h.amount)} · {h.orders}</p>)}</section><section className="order-panel"><h2>{t("Sessões do dia")}</h2>{data.sessions.map(s=><p key={s.id}><Link href={`/cashier/sessions?session=${s.id}`}>{new Date(s.opened_at).toLocaleString()} · {s.operator_id}</Link> · {t(s.status==="closed"?"Fechado":"Aberto")} · {s.difference===null?"—":money.format(s.difference)}</p>)}</section></>}
 </section>;
}
