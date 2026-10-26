"use client";
import {useEffect,useState} from "react";
import {useTranslation} from "@/components/language-provider";
import {customerApi} from "@/features/customer-ordering/public-client";
import type {OperationsPolicy,OperationsState} from "@/lib/operations";
import "./operations.css";

type Status={policy:OperationsPolicy;state:OperationsState;free_bytes:number|null;alerts:Record<string,boolean>};
function useOperations(){
 const [data,setData]=useState<Status|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;async function load(){try{const value=await customerApi<Status>("/api/staff/operations",{signal:AbortSignal.timeout(10000)});if(alive){setData(value);setFailed(false);}}catch{if(alive)setFailed(true);}}void load();const timer=setInterval(()=>void load(),30000);return()=>{alive=false;clearInterval(timer);};},[]);
 return {data,failed};
}
export function OperationsAlerts(){
 const t=useTranslation(),{data,failed}=useOperations();
 const labels:Record<string,string>={stale:"Backup ausente ou atrasado. Avise o administrador.",external:"A cópia externa do backup precisa de atenção.",disk:"Espaço em disco baixo ou indisponível. Avise o administrador.",supervisor:"A supervisão dos serviços precisa de atenção.",failed:"A última tentativa de backup falhou.",migration:"O histórico de migrações precisa de conferência antes de atualizar ou restaurar."};
 if(!failed&&!data)return null;
 return <aside className="operations-alerts" aria-label={t("Estado operacional")}>{failed&&<p role="alert" className="form-error">{t("Não foi possível consultar o estado operacional.")}</p>}{data&&Object.entries(labels).filter(([key])=>data.alerts[key]).map(([key,label])=><p key={key} role="alert" className="form-error">{t(label)}</p>)}</aside>;
}
export function OperationsPanel({editable=false}:{editable?:boolean}){
 const t=useTranslation(),{data,failed}=useOperations();
 const [draft,setDraft]=useState<OperationsPolicy|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 if(!data)return <p role="status">{t(failed?"Não foi possível consultar o estado operacional.":"Carregando estado operacional...")}</p>;
 const policy=draft??data.policy;
 const timestamp=(value?:string)=>value?new Date(value).toLocaleString():"—";
 async function save(){setBusy(true);try{await customerApi("/api/staff/operations",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(policy)});setNotice(t("Configuração operacional salva. O supervisor aplicará os novos intervalos."));}catch{setNotice(t("Não foi possível salvar a configuração operacional."));}finally{setBusy(false);}}
 return <section className="operations-panel order-panel"><h2>{t("Backup e serviços locais")}</h2>
  <dl className="operations-metrics"><div><dt>{t("Último backup válido")}</dt><dd>{timestamp(data.state.last_success)}</dd></div><div><dt>{t("Última tentativa")}</dt><dd>{timestamp(data.state.last_attempt)} · {t(data.state.result==="valid"?"Verificada":data.state.result==="failed"?"Falhou":"Pendente")}</dd></div><div><dt>{t("Cópia externa")}</dt><dd>{t(data.alerts.external?"Precisa de atenção":data.state.external==="valid"?"Verificada":data.state.external==="disabled"?"Não configurada":"Precisa de atenção")}</dd></div><div><dt>{t("Espaço livre em disco")}</dt><dd>{data.free_bytes===null?"—":`${(data.free_bytes/1073741824).toFixed(1)} GB`}</dd></div></dl>
  {editable&&<><div className="operations-fields">{([
   ["interval_hours","Backup a cada (horas)",1,168],["stale_hours","Alertar após (horas sem backup)",1,720],["daily","Backups diários mantidos",1,365],["weekly","Backups semanais mantidos",1,104],["minimum_free_mb","Espaço mínimo livre (MB)",100,100000],
  ] as const).map(([key,label,min,max])=><label className="field-group" key={key}>{t(label)}<input className="order-input" type="number" min={min} max={max} step="1" disabled={busy} value={policy[key]} onChange={event=>setDraft({...policy,[key]:Number(event.target.value)})}/></label>)}</div>
  <label className="field-group">{t("Pasta externa de backup")}<input className="order-input" maxLength={1000} value={policy.external_directory} disabled={busy} onChange={event=>setDraft({...policy,external_directory:event.target.value})}/></label>
  <p>{t("Use uma pasta existente em pendrive, rede ou nuvem sincronizada. Uma cópia no mesmo disco não protege contra perda do notebook.")}</p>
  <label className="operations-check"><input type="checkbox" disabled={busy} checked={policy.after_cash_close} onChange={event=>setDraft({...policy,after_cash_close:event.target.checked})}/>{t("Fazer backup após fechar uma sessão de caixa")}</label>
  <p>{t("Backups contêm nomes e telefones. Proteja o acesso e guarde os segredos separadamente.")}</p>
  <button className="primary-button" type="button" disabled={busy} onClick={()=>void save()}>{t("Salvar configuração operacional")}</button>{notice&&<p role="status">{notice}</p>}
  </>}
 </section>;
}
