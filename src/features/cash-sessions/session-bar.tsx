"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useLanguage,useTranslation} from "@/components/language-provider";
import {displayBusinessDate} from "@/features/auth/navigation";
import {customerApi} from "@/features/customer-ordering/public-client";
import type {CashState} from "./types";
export function CashSessionBar({timezone,dayStart,current=false}:{timezone?:string;dayStart?:string;current?:boolean}){
 const t=useTranslation(),{locale}=useLanguage();const [state,setState]=useState<CashState|null>(null),[failed,setFailed]=useState(false),[now,setNow]=useState<number|null>(null);
 useEffect(()=>{let alive=true;const load=()=>{if(alive)setNow(Date.now());void customerApi<CashState>("/api/staff/cash-sessions",{signal:AbortSignal.timeout(10000)}).then(v=>{if(alive){setState(v);setFailed(false);}}).catch(()=>{if(alive)setFailed(true);});};load();const timer=setInterval(load,15000);window.addEventListener("cash-session-changed",load);window.addEventListener("focus",load);return()=>{alive=false;clearInterval(timer);window.removeEventListener("cash-session-changed",load);window.removeEventListener("focus",load);};},[]);
 const day=now&&timezone&&dayStart?displayBusinessDate(now,timezone,dayStart):null;
 return <aside className="cash-session-bar" aria-label={t("Estado do caixa")}>
 <Link className="session-shortcut" href="/cashier/sessions" aria-current={current?"page":undefined}><strong>{t("Meu caixa")}</strong><span>{failed?t("Não foi possível consultar o caixa."):!state?t("Consultando..."):t(state.current?"Caixa aberto":"Abrir caixa")}</span></Link>
 {state?.current&&<span>{t("Abertura")}: {new Intl.DateTimeFormat(locale,{timeStyle:"short",...(timezone?{timeZone:timezone}:{})}).format(new Date(state.current.opened_at))}</span>}
 <span>{t("Dia comercial")}: {day??"—"}{state?.current&&day&&state.current.business_date!==day?` · ${t("Sessão")}: ${state.current.business_date}`:""}</span>
 {state&&!state.current&&state.policy.require_open_session&&<small>{t("Abra o caixa antes de registrar pagamentos.")}</small>}
 </aside>;
}
