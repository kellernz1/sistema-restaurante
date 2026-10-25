"use client";
import { useEffect,useState,useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/language-provider";
import { customerApi } from "@/features/customer-ordering/public-client";
import type { PrintJob } from "./document";
import { uuid } from "@/lib/uuid";
import { processBrowserPrint,browserPrintHeartbeat } from "./browser-processor";
import { PrintRequestButton } from "./print-request-button";
function subscribe(callback:()=>void){window.addEventListener("mesa-print-preference",callback);window.addEventListener("storage",callback);return()=>{window.removeEventListener("mesa-print-preference",callback);window.removeEventListener("storage",callback);};}
let preference=false;
function readPreference(){try{return localStorage.getItem("mesa-browser-print-v2")==="true";}catch{return preference;}}
type Health={status:string;stalled_jobs:number;stall_seconds:number;workers:{instance:string;driver:string;version:string;last_seen:string;active:boolean}[]};
export function PrintQueue() {
 const t=useTranslation();
 const [jobs,setJobs]=useState<PrintJob[]>([]),[issues,setIssues]=useState(0),[error,setError]=useState("");
 const [status,setStatus]=useState("all"),[archived,setArchived]=useState(false),[counts,setCounts]=useState<Record<string,number>>({});
 const [health,setHealth]=useState<Health|null>(null),[admin,setAdmin]=useState(false),[revision,setRevision]=useState(0);
 const enabled=useSyncExternalStore(subscribe,readPreference,()=>false);
 useEffect(()=>{
  let alive=true;let timer:ReturnType<typeof setTimeout>;
  async function tick(){
   try{
    if(enabled&&document.visibilityState==="visible")await browserPrintHeartbeat();
    const data=await customerApi<{jobs:PrintJob[];issues:number;health:Health;counts:Record<string,number>;role:string}>(`/api/staff/printing?status=${status}&archived=${archived}`,{signal:AbortSignal.timeout(10000)});
    if(!alive)return;
    setJobs(data.jobs);setIssues(data.issues);setHealth(data.health);setCounts(data.counts);setAdmin(data.role==="admin");setError("");
    if(enabled&&document.visibilityState==="visible")await processBrowserPrint();
   }catch{if(alive)setError(t("Impressão desconectada. Reconectando..."));}
   finally{if(alive)timer=setTimeout(tick,5000);}
  }
  void tick();return()=>{alive=false;clearTimeout(timer);};
 },[enabled,t,status,archived,revision]);
 const labels:Record<string,string>={all:"Todos",pending:"Pendente",processing:"Processando",sent:"Enviado",failed:"Falhou",uncertain:"Incerto: conferir antes de reimprimir"};
 async function review(job:PrintJob,decision:"printed"|"discard"){
  if(!window.confirm(t(decision==="discard"?"Arquivar sem imprimir? O trabalho nunca será enviado.":"Confirme que o trabalho foi impresso e que o processador parou.")))return;
  try{await customerApi("/api/staff/printing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"review",job_id:job.id,decision,request_id:uuid()}),signal:AbortSignal.timeout(10000)});setRevision(v=>v+1);}
  catch{setError(t("Aguarde o processador parar antes de conferir."));}
 }
 return <section className="order-panel" style={{margin:"20px 0"}}>
  <h2>{t("Fila de impressão")}</h2>
  {(issues>0||error)&&<p className="form-error" role="alert">{error||t("Há impressões que precisam de conferência.")}</p>}
  {health&&health.stalled_jobs>0&&<p className="form-error" role="alert">{t("Há trabalhos pendentes sem processador ativo. Verifique o computador da impressora.")}</p>}
  <button className="ghost-button" type="button" aria-pressed={enabled} onClick={()=>{preference=!enabled;try{localStorage.setItem("mesa-browser-print-v2",String(!enabled));}catch{/* Optional preference. */}window.dispatchEvent(new Event("mesa-print-preference"));}}>{t(enabled?"Desativar navegador neste computador":"Ativar navegador neste computador")}</button>
  <small style={{display:"block",margin:"12px 0"}}>{t("Navegador: mantenha esta aba visível. Arquivo de teste: processador local independente. Enviado não confirma saída no papel.")}</small>
  <details><summary>{t("Trabalhos recentes")}</summary>
   <div className="cashier-actions">{Object.entries(labels).map(([value,label])=><button type="button" className="ghost-button" aria-pressed={status===value} key={value} onClick={()=>setStatus(value)}>{t(label)}{value!=="all"?` (${counts[value]??0})`:""}</button>)}<label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>{t("Mostrar arquivados")}</label></div>
   {jobs.map(job=><article key={job.id} style={{padding:"16px 0",borderTop:"1px solid var(--line)"}}>
    <strong>{job.kind==="cash_session"?`${t("Fechamento de caixa")} · ${job.snapshot.cash_report?.session.business_date??""}`:job.snapshot?.ticket!=null?t("Senha {0}").replace("{0}",String(job.snapshot.ticket)):`#${job.snapshot?.number??"—"}`} · {t(job.destination==="kitchen"?"Cozinha":"Caixa")} · {t(job.additional?"Adicional":job.reprint?"Reimpressão":"Original")}</strong>
    <p>{t(labels[job.status]??job.status)} · {job.device?.name}{job.archived_at?` · ${t("Arquivado")}`:""}</p>
    {job.review_decision&&<p>{t("Decisão")}: {t(({printed:"Impresso",reprint:"Reimprimir",discard:"Descartar"} as Record<string,string>)[job.review_decision])} · {job.reviewed_by??"—"} · {job.reviewed_at?new Date(job.reviewed_at).toLocaleString():""}</p>}
    {!job.archived_at&&!job.reviewed_at&&["uncertain","failed"].includes(job.status)&&<button type="button" className="ghost-button" onClick={()=>void review(job,"printed")}>{t("Confirmar que foi impresso")}</button>}
    {admin&&!job.archived_at&&<button type="button" className="ghost-button" onClick={()=>void review(job,"discard")}>{t("Arquivar sem imprimir")}</button>}
    <Link className="back-link" href={`/print/jobs/${job.id}`}>{t("Visualizar")}</Link>
    {!job.archived_at&&job.status!=="processing"&&<PrintRequestButton jobId={job.id} label="Reimprimir" />}
   </article>)}
   {health?.workers.map(worker=><p key={worker.instance}>{worker.driver} · {worker.version} · {t(worker.active?"Ativo":"Inativo")} · {new Date(worker.last_seen).toLocaleString()}</p>)}
  </details>
 </section>;
}
