"use client";
import {useTranslation} from "@/components/language-provider";
import {money,brl,paymentLabels,type PaymentMethod} from "@/lib/money";
import {canRevealExpected} from "./domain";
import type {CashReport,CashSummary} from "./types";
export function PaymentSummary({value}:{value:CashSummary}){
 const t=useTranslation();return <>
 <p><strong>{t("Recebimentos líquidos")}: {money.format(value.total)}</strong></p>
 {value.refunds&&<section><p>{t("Recebimentos antes das devoluções")}: {money.format(value.gross_receipts??value.total)}</p><p><strong>{t("Devoluções registradas")}: {value.refunds.count} · {money.format(value.refunds.amount)}</strong></p>{value.refunds.methods.map(r=><p key={r.method+r.currency}>{t(paymentLabels[r.method as PaymentMethod])} · {r.currency==="BRL"?brl.format(r.original):money.format(r.original)} · {money.format(r.amount)}</p>)}{value.refunds.operators.map(r=><p key={r.operator_id}>{r.full_name??t("Sistema")}: {r.count} · {money.format(r.amount)}</p>)}<p>{t("Ajuste devolvido de arredondamento")}: {money.format(value.refunds.rounding)}</p></section>}
 <div style={{overflowX:"auto"}}><table><thead><tr><th>{t("Forma de pagamento")}</th><th>{t("Valor original")}</th><th>{t("Líquido em guaraníes")}</th></tr></thead><tbody>{value.methods.map(row=><tr key={row.method+row.currency}><td>{t(paymentLabels[row.method as PaymentMethod])} · {row.currency}</td><td>{row.currency==="BRL"?brl.format(row.original):money.format(row.original)}</td><td>{money.format(row.net)}</td></tr>)}</tbody></table></div>
 {value.adjustments && <div>{([ ["Descontos",value.adjustments.discounts],["Cancelamentos após cozinha",value.adjustments.kitchen_cancellations]] as const).map(([label,a])=><div key={label}><p><strong>{t(label)}: {a.count} · {money.format(a.amount)}</strong></p>{a.operators.map(o=><p key={o.actor_id}>{o.full_name??t("Sistema")}: {o.count} · {money.format(o.amount)}</p>)}</div>)}</div>}
 <p>{t("Ajustes de arredondamento (separados da receita)")}: {money.format(value.rounding_adjustment)}</p>
 <p>{t("Pedidos com recebimentos")}: {value.order_count} · {t("Taxas de entrega atribuídas")}: {money.format(value.delivery_fees)}</p>
 {value.types.map(row=><p key={row.type}>{t(({counter:"Balcão",pickup:"Retirada",delivery:"Entrega",dine_in:"Local"} as Record<string,string>)[row.type])}: {row.orders} · {money.format(row.net)}</p>)}
 <p>{t("Cancelados ou recusados")}: {value.cancellations.count} · {money.format(value.cancellations.amount)} ({t("Recusados")}: {value.cancellations.rejected_count} · {money.format(value.cancellations.rejected_amount)})</p>
 </>;
}
export function CashReportView({report}:{report:CashReport}){
 const t=useTranslation();return <section className="order-panel cash-report"><h2>{t("Relatório do turno")}</h2><p>{report.operator_name??report.session.operator_id} · {report.session.business_date}</p>
 <p>{t("Fundo inicial")}: {money.format(report.session.opening_amount)}</p>
 {!canRevealExpected(report.blind??false,report.counted??null)?<p>{t("Contagem às cegas: informe o dinheiro contado para concluir.")}</p>:<>
 {report.payments&&<PaymentSummary value={report.payments}/>}
 <p>{t("Suprimentos")}: {money.format(report.supply??0)} · {t("Sangrias")}: {money.format(report.withdrawal??0)}</p>
 <p>{t("Esperado em dinheiro")}: <strong>{money.format(report.expected??0)}</strong></p>
 {report.counted!==undefined&&<><p>{t("Dinheiro contado")}: {money.format(report.counted)}</p><p>{t("Diferença")}: <strong>{money.format(report.difference??0)} · {t((report.difference??0)>0?"Sobra":(report.difference??0)<0?"Falta":"Sem diferença")}</strong></p></>}
 {report.notes&&<p>{report.notes}</p>}
 {report.movements?.map(row=><p key={row.id}>{t(row.kind==="supply"?"Suprimento":"Sangria")}: {money.format(row.amount)} · {row.reason}</p>)}
 </>}
 {report.unpaid.length>0&&<details open><summary>{t("Há pedidos ainda não pagos. O fechamento não os altera.")}</summary>{report.unpaid.map(order=><p key={order.id}>{order.ticket!=null?t("Senha {0}").replace("{0}",String(order.ticket)):`#${order.number}`} · {order.name} · {money.format(order.total)}</p>)}</details>}
 {report.events&&<details><summary>{t("Eventos da sessão")}</summary><ol className="cash-events">{report.events.map(event=>{
 const action=event.action==="movement"?(event.payload.kind==="supply"?"Suprimento":"Sangria"):({open:"Abertura",close:"Fechamento",reopen:"Reabertura"} as Record<string,string>)[event.action]??"Movimento";
 const amount=event.action==="open"?event.payload.opening_amount:event.action==="close"?event.payload.counted_amount:event.payload.amount;
 const note=event.payload.reason??event.payload.notes;
 return <li key={event.id}><div className="cash-event-heading"><strong>{t(action)}</strong><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div><p>{event.actor_name?.trim()||t("Funcionário sem nome")}</p>{typeof amount==="number"&&<p>{t(event.action==="close"?"Dinheiro contado":"Valor")}: <strong>{money.format(amount)}</strong></p>}{typeof note==="string"&&note.trim()&&<p className="cash-event-note">{t(event.action==="close"?"Observação do fechamento":"Motivo")}: {note}</p>}</li>;
 })}</ol></details>}
 </section>;
}
