"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useTranslation} from "@/components/language-provider";
import {customerApi} from "@/features/customer-ordering/public-client";
import type {CashState} from "./types";
export function CashSessionBar(){
 const t=useTranslation();const [state,setState]=useState<CashState|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;const load=()=>{void customerApi<CashState>("/api/staff/cash-sessions",{signal:AbortSignal.timeout(10000)}).then(v=>{if(alive){setState(v);setFailed(false);}}).catch(()=>{if(alive)setFailed(true);});};load();const timer=setInterval(load,15000);window.addEventListener("cash-session-changed",load);window.addEventListener("focus",load);return()=>{alive=false;clearInterval(timer);window.removeEventListener("cash-session-changed",load);window.removeEventListener("focus",load);};},[]);
 return <aside className="order-panel" style={{margin:"16px 0",display:"flex",flexWrap:"wrap",gap:16,alignItems:"center",justifyContent:"space-between"}}>
 <span>{failed?t("Não foi possível consultar o caixa."):state?.current?`${t("Caixa aberto")} · ${new Date(state.current.opened_at).toLocaleString()}`:t("Nenhuma sessão de caixa aberta")}</span>
 <Link className="primary-button" href="/cashier/sessions">{t(state?.current?"Movimentos e fechamento":"Abrir caixa")}</Link>
 {state&&!state.current&&state.policy.require_open_session&&<small>{t("Abra o caixa antes de registrar pagamentos.")}</small>}
 </aside>;
}
