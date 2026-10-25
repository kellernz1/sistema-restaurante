"use client";
import {useState,useRef} from "react";
import {useTranslation} from "@/components/language-provider";
import {customerApi} from "@/features/customer-ordering/public-client";
import {processBrowserPrint} from "@/features/printing/browser-processor";
import {uuid} from "@/lib/uuid";
export function CashSessionPrintButton({sessionId,revision}:{sessionId:string;revision:number}){
 const t=useTranslation();const [busy,setBusy]=useState(false),[message,setMessage]=useState("");const lock=useRef(false);
 return <div><button className="primary-button" type="button" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);const key=`cash-session-print:${sessionId}:${revision}`;
 try{const requestId=sessionStorage.getItem(key)??uuid();sessionStorage.setItem(key,requestId);await customerApi(`/api/staff/cash-sessions/${sessionId}/print`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({request_id:requestId}),signal:AbortSignal.timeout(10000)});sessionStorage.removeItem(key);setMessage(t("Trabalho adicionado à fila."));await processBrowserPrint();}catch{setMessage(t("Confira a fila antes de tentar novamente."));}finally{lock.current=false;setBusy(false);}
 }}>{t("Enviar relatório ao caixa")}</button>{message&&<p role="status">{message}</p>}</div>;
}
