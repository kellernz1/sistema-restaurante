"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useTranslation} from "@/components/language-provider";
import {customerApi,CustomerApiError} from "@/features/customer-ordering/public-client";
import {money} from "@/lib/money";
import {uuid} from "@/lib/uuid";
import {cashCommandSchema} from "./validation";
import {denominationTotal} from "./domain";
import type {CashReport,CashState} from "./types";
import {CashReportView} from "./report-view";
import {CashSessionPrintButton} from "./session-print-button";
type Command=ReturnType<typeof cashCommandSchema.parse>;
export function SessionsPanel({initialSession=""}:{initialSession?:string}){
 const t=useTranslation();const [data,setData]=useState<CashState|null>(null),[selected,setSelected]=useState(initialSession),[report,setReport]=useState<CashReport|null>(null),[revision,setRevision]=useState(0);
 const [opening,setOpening]=useState(""),[counted,setCounted]=useState(""),[notes,setNotes]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[kind,setKind]=useState<"supply"|"withdrawal">("supply");
 const [denoms,setDenoms]=useState<{value:number;quantity:number}[]|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
 const pending=useRef<Command|null>(null),lock=useRef(false);
 useEffect(()=>{const controller=new AbortController();void customerApi<CashState>("/api/staff/cash-sessions",{signal:controller.signal}).then(v=>{setData(v);setSelected(old=>old||v.current?.id||v.sessions[0]?.id||"");}).catch(()=>{if(!controller.signal.aborted)setError(t("Não foi possível consultar o caixa."));});return()=>controller.abort();},[revision,t]);
 useEffect(()=>{if(!selected)return;const controller=new AbortController();void customerApi<CashReport>(`/api/staff/cash-sessions/${selected}`,{signal:controller.signal}).then(setReport).catch(()=>{if(!controller.signal.aborted)setError(t("Relatório indisponível."));});return()=>controller.abort();},[selected,revision,t]);
 useEffect(()=>{const timer=setTimeout(()=>{try{const saved=sessionStorage.getItem("cash-session-command");if(saved){pending.current=cashCommandSchema.parse(JSON.parse(saved));setUncertain(true);}}catch{setError(t("Confira a sessão antes de continuar."));}},0);return()=>clearTimeout(timer);},[t]);
 async function submit(action?:Command["action"],payload?:object){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");
  try{if(!pending.current){const candidate=cashCommandSchema.parse({action,payload,request_id:uuid()});sessionStorage.setItem("cash-session-command",JSON.stringify(candidate));pending.current=candidate;}
   const result=await customerApi<{session_id:string}>("/api/staff/cash-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pending.current),signal:AbortSignal.timeout(15000)});
   pending.current=null;sessionStorage.removeItem("cash-session-command");setUncertain(false);setSelected(result.session_id);setRevision(v=>v+1);setCounted("");setDenoms(null);setReason("");setAmount("");window.dispatchEvent(new Event("cash-session-changed"));
  }catch(e){if(e instanceof CustomerApiError&&e.status>=400&&e.status<500&&![401,429].includes(e.status)){pending.current=null;sessionStorage.removeItem("cash-session-command");setUncertain(false);}else if(pending.current)setUncertain(true);setError(t(e instanceof CustomerApiError?e.message:"Confira os valores e a sessão antes de continuar."));}
  finally{lock.current=false;setBusy(false);}
 }
 const ownOpen=!!data?.current&&selected===data.current.id;
 return <section className="cash-sessions"><header className="section-heading"><h1>{t("Turnos de caixa")}</h1></header>
 {error&&<p className="form-error" role="alert">{error}</p>}{uncertain&&<button className="primary-button" disabled={busy} onClick={()=>void submit()}>{t("Consultar envio")}</button>}
 {!data?.current&&<fieldset className="order-panel" disabled={busy||uncertain}><legend>{t("Abrir caixa")}</legend><label>{t("Fundo inicial (Gs)")}<input className="order-input" type="number" min={0} step={1} value={opening} onChange={e=>setOpening(e.target.value)}/></label><button className="primary-button" disabled={opening===""} onClick={()=>void submit("open",{opening_amount:Number(opening)})}>{t("Abrir caixa")}</button></fieldset>}
 <label>{t("Sessão")}<select className="order-input" value={selected} onChange={e=>{setSelected(e.target.value);setReport(null);}}>{selected&&data&&!data.sessions.some(s=>s.id===selected)&&<option value={selected}>{report?.session.business_date??selected}</option>}{data?.sessions.map(s=><option key={s.id} value={s.id}>{s.business_date} · {s.operator_id===data.user_id?t("Meu caixa"):s.operator_id} · {t(s.status==="open"?"Aberto":"Fechado")} · {new Date(s.opened_at).toLocaleString()}</option>)}</select></label>
 {ownOpen&&<div className="cash-forms"><fieldset className="order-panel" disabled={busy||uncertain}><legend>{t("Movimento de dinheiro")}</legend><select className="order-input" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="supply">{t("Suprimento")}</option><option value="withdrawal">{t("Sangria / despesa")}</option></select><label>{t("Valor em guaraníes")}<input className="order-input" type="number" min={1} step={1} value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>{t("Motivo obrigatório")}<input className="order-input" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="primary-button" disabled={!amount||!reason.trim()} onClick={()=>void submit("movement",{session_id:selected,kind,amount:Number(amount),reason})}>{t("Registrar movimento")}</button></fieldset>
 <fieldset className="order-panel" disabled={busy||uncertain}><legend>{t("Fechar caixa")}</legend><label>{t("Dinheiro contado (Gs)")}<input className="order-input" type="number" min={0} step={1} value={counted} onChange={e=>{setCounted(e.target.value);setDenoms(null);}}/></label>
 <details><summary>{t("Contar cédulas e moedas")}</summary>{[50,100,500,1000,2000,5000,10000,20000,50000,100000].map(value=><label className="cash-denomination" key={value}>{money.format(value)}<input className="order-input" type="number" min={0} max={100000} step={1} value={denoms?.find(r=>r.value===value)?.quantity??0} onChange={e=>{const rows=(denoms??[]).filter(r=>r.value!==value).concat({value,quantity:Number(e.target.value)});setDenoms(rows);try{setCounted(String(denominationTotal(rows)));}catch{setCounted("");}}}/></label>)}</details>
 <label>{t("Observação do fechamento")}<textarea className="order-input" maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="primary-button" disabled={counted===""} onClick={()=>void submit("close",{session_id:selected,counted_amount:Number(counted),notes,...(denoms?{denominations:denoms}:{})})}>{t("Confirmar fechamento")}</button></fieldset></div>}
 {report&&<><CashReportView report={report}/>{report.session.status==="closed"&&<div className="cashier-actions"><Link className="back-link" href={`/print/cash-session/${selected}`}>{t("Página imprimível")}</Link><CashSessionPrintButton sessionId={selected} revision={report.session.revision}/>{data?.role==="admin"&&<button className="ghost-button" disabled={busy||uncertain} onClick={()=>{const value=window.prompt(t("Motivo obrigatório para reabrir"));if(value?.trim())void submit("reopen",{session_id:selected,reason:value});}}>{t("Reabrir sessão")}</button>}</div>}</>}
 </section>;
}
