"use client";
import {useEffect,useRef,useState}from "react";
import {createPortal}from "react-dom";
import {useTranslation}from "@/components/language-provider";
import {money,brl,paymentLabels,type PaymentMethod}from "@/lib/money";
import{uuid}from "@/lib/uuid";
import{approvalRequest}from "@/features/approvals/sensitive-actions";
import{approvalFailureMessage,type ApprovalResult}from "@/features/approvals/pin-feedback";
type Line={payment_id:string;method:PaymentMethod;currency:string;original:number;amount:number;rate:string|null;rounding:number};
type Quote={binding:string;number:number;ticket:number|null;total:number;discount:number;paid:number;refunded:number;available:number;amount:number;lines:Line[];requires_approval:boolean};
async function requestRefund(payload:object){const response=await fetch("/api/staff/refunds",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const r=await response.json();if(!response.ok)throw Object.assign(Error(r.error),{status:response.status});return r;}
export function RefundActions({orderId,onChanged,disabled=false}:{orderId:string;onChanged:()=>void;disabled?:boolean}){
 const t=useTranslation();const[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const[action,setAction]=useState<"refund"|"cancel_refund">("cancel_refund"),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[quote,setQuote]=useState<Quote|null>(null);
 const[approvers,setApprovers]=useState<{id:string;name:string}[]>([]),[approver,setApprover]=useState(""),[pin,setPin]=useState(""),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(false);
 const[grant,setGrant]=useState<string|null>(null),[revision,setRevision]=useState(0),[historyError,setHistoryError]=useState(false);
 const[history,setHistory]=useState<{id:string;amount_pyg:number;original_amount:number;currency:string;method:PaymentMethod;reason:string;created_at:string}[]>([]);
 const key=`refund-pending:${orderId}`;
 useEffect(()=>{const timer=setTimeout(()=>setPending(!!sessionStorage.getItem(key)),0);return()=>clearTimeout(timer);},[key,revision]);
 const dialog=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow="hidden";dialog.current?.focus();
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.stopPropagation();event.preventDefault();if(!busy){setOpen(false);setPin("");}return;}
   if(event.key!=="Tab")return;
   const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')??[]).filter(e=>e.getClientRects().length);
   const first=controls[0],last=controls.at(-1);
   if(!first){event.preventDefault();return;}
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first.focus();}
   event.stopPropagation();
  };
  document.addEventListener("keydown",keyboard,true);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",keyboard,true);previous?.focus();};
 },[open,busy]);
 useEffect(()=>{let active=true;void fetch(`/api/staff/refunds?order=${orderId}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(rows=>{if(active){setHistory(rows);setHistoryError(false);}}).catch(()=>{if(active)setHistoryError(true);});return()=>{active=false;};},[orderId,revision]);
 const operation={action,target:orderId,reason,...(action==="refund"?{amount:Number(amount)}:{})};
 async function start(){setOpen(true);setQuote(null);setGrant(null);setError("");setPin("");setApprover("");setConfirmed(false);setPending(!!sessionStorage.getItem(key));try{const c=await approvalRequest();setApprovers(c.approvers);}catch(e){setError((e as Error).message);}}
 async function submit(){
  setBusy(true);setError("");
  try{
   const stored=sessionStorage.getItem(key);if(stored){await requestRefund(JSON.parse(stored));sessionStorage.removeItem(key);setPending(false);setOpen(false);setRevision(v=>v+1);onChanged();return;}
   if(!quote){setQuote(await requestRefund({command:"quote",operation}));return;}
   if(quote.requires_approval&&!grant){const result:ApprovalResult=await requestRefund({command:"approve",request:uuid(),operation,binding:quote.binding,approver,pin});setPin("");if(!result.ok||!result.authorization)throw Error(approvalFailureMessage(result,t));setGrant(result.authorization);return;}
   if(!confirmed)throw Error(t("Confirme que a devolução manual foi realizada uma única vez."));
   const payload={command:"execute",request:uuid(),operation,binding:quote.binding,authorization:grant,confirmed:true};sessionStorage.setItem(key,JSON.stringify(payload));setPending(true);
   await requestRefund(payload);sessionStorage.removeItem(key);setPending(false);setOpen(false);setRevision(v=>v+1);onChanged();
  }catch(e){setPin("");setError((e as Error).message);if((e as Error&{status?:number}).status===409){sessionStorage.removeItem(key);setPending(false);setQuote(null);setGrant(null);setConfirmed(false);}}
  finally{setBusy(false);}
 }
 return <>{(!disabled||pending)&&<button type="button"className="ghost-button"onClick={()=>void start()}>{t(pending?"Consultar envio":"Estornos e cancelamento")}</button>}{historyError&&<p role="alert">{t("Não foi possível atualizar as devoluções registradas.")}</p>}{history.length>0&&<details><summary>{t("Devoluções registradas")}: {money.format(history.reduce((sum,r)=>sum+r.amount_pyg,0))}</summary>{history.map(r=><p key={r.id}>{t(paymentLabels[r.method])} · {r.currency==="BRL"?brl.format(r.original_amount):money.format(r.original_amount)} · {r.reason}</p>)}</details>}
 {open&&createPortal(<div className="approval-overlay"><section ref={dialog} tabIndex={-1} className="card approval-dialog"role="dialog"aria-modal="true"aria-label={t("Estornos e cancelamento")}><h2>{t("Estornos e cancelamento")}</h2>
 <p>{t("A devolução é manual. O sistema não envia Pix nem solicita estorno ao banco ou à operadora.")}</p>
 {!quote?<><label>{t("Ação")}<select value={action}onChange={e=>setAction(e.target.value as typeof action)}><option value="cancel_refund">{t("Cancelar pedido e estornar")}</option><option value="refund">{t("Estornar valor sem cancelar")}</option></select></label>{action==="refund"&&<label>{t("Valor em guaraníes")}<input type="number"min="1"step="1"value={amount}onChange={e=>setAmount(e.target.value)}/></label>}<label>{t("Motivo obrigatório")}<input maxLength={300}value={reason}onChange={e=>setReason(e.target.value)}/></label></>:<>
 <p>#{quote.number}{quote.ticket!=null?` · ${t("Senha {0}").replace("{0}",String(quote.ticket))}`:""}</p><p>{t("Total com desconto")}: <strong>{money.format(quote.total)}</strong></p><p>{t("Recebido líquido de troco")}: {money.format(quote.paid)}</p><p>{t("Já estornado")}: {money.format(quote.refunded)}</p><p>{t("Saldo estornável")}: <strong>{money.format(quote.available)}</strong></p>
 <p><strong>{t("Devolver agora")}: {money.format(quote.amount)}</strong></p>{quote.lines.map(l=><div key={l.payment_id}><p>{t(paymentLabels[l.method])} · {l.currency==="BRL"?brl.format(l.original):money.format(l.original)}{l.rate!=null?` · ${t("Cotação")}: ${l.rate}`:""}</p>{l.rounding!==0&&<small>{t("Ajuste histórico de arredondamento")}: {money.format(l.rounding)}</small>}</div>)}{quote.amount===0&&<p>{t("Sem valor pago a devolver. O pedido será apenas cancelado.")}</p>}
 {quote.requires_approval&&!grant&&<>{!approvers.length?<p>{t("Nenhum aprovador com PIN cadastrado. Peça ao administrador ou supervisor para configurar o próprio PIN.")}</p>:<><label>{t("Aprovador")}<select value={approver}onChange={e=>{setApprover(e.target.value);setPin("");setError("");}}><option value="">{t("Selecione")}</option>{approvers.map(a=><option key={a.id}value={a.id}>{a.name}</option>)}</select></label><label>{t("PIN de aprovação")}<input type="password"inputMode="numeric"maxLength={6}autoComplete="off"value={pin}onChange={e=>setPin(e.target.value)}/></label></>}</>}
 {(!quote.requires_approval||grant)&&<label><input type="checkbox"checked={confirmed}onChange={e=>setConfirmed(e.target.checked)}/>{t("Confirmo que a devolução manual foi realizada uma única vez, conforme os valores acima.")}</label>}</>}
 {error&&<p role="alert"className="approval-feedback">{t(error)}</p>}<div className="approval-actions"><button disabled={busy}onClick={()=>{setOpen(false);setPin("");}}>{t("Cancelar")}</button><button className="primary-button"disabled={busy||(!pending&&!!quote&&(quote.requires_approval&&!grant?(!approver||!/^\d{4,6}$/.test(pin)):!confirmed))}onClick={()=>void submit()}>{t(pending?"Consultar envio":quote?(quote.requires_approval&&!grant?"Autorizar estorno":"Registrar devolução"):"Conferir estorno")}</button></div>
 <small>{t("Em caso de resposta incerta, consulte o mesmo envio. Não devolva o dinheiro novamente.")}</small></section></div>,document.body)}</>;
}
