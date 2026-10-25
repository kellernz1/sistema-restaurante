"use client";
import {useEffect,useState} from "react";
import {useTranslation} from "@/components/language-provider";
import {customerApi} from "@/features/customer-ordering/public-client";
import type {CashState} from "./types";
export function CashPolicySettings(){
 const t=useTranslation();const [policy,setPolicy]=useState({require_open_session:true,blind_count:true}),[message,setMessage]=useState("");
 useEffect(()=>{let alive=true;void customerApi<CashState>("/api/staff/cash-sessions").then(v=>{if(alive)setPolicy(v.policy);}).catch(()=>{if(alive)setMessage(t("Não foi possível consultar o caixa."));});return()=>{alive=false;};},[t]);
 return <fieldset className="settings-fieldset"><legend>{t("Turnos de caixa")}</legend><label><input type="checkbox" checked={policy.require_open_session} onChange={e=>setPolicy({...policy,require_open_session:e.target.checked})}/>{t("Exigir sessão aberta para receber pagamentos")}</label><label><input type="checkbox" checked={policy.blind_count} onChange={e=>setPolicy({...policy,blind_count:e.target.checked})}/>{t("Contagem às cegas por padrão")}</label><button className="primary-button" type="button" onClick={async()=>{try{await customerApi("/api/staff/cash-sessions",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(policy)});setMessage(t("Configurações atualizadas"));}catch{setMessage(t("Não foi possível salvar."));}}}>{t("Salvar opções de caixa")}</button>{message&&<p role="status">{message}</p>}</fieldset>;
}
