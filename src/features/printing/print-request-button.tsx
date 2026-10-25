"use client";
import { useEffect,useRef,useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { customerApi,CustomerApiError } from "@/features/customer-ordering/public-client";
import { uuid } from "@/lib/uuid";
import { processBrowserPrint } from "./browser-processor";
import {loadPrintRequest,savePrintRequest,clearPrintRequest,type PendingPrintRequest} from "./pending-request";
export function PrintRequestButton({orderId,jobId,kind="kitchen",destination="kitchen",label="Imprimir comanda da cozinha"}:{orderId?:string;jobId?:string;kind?:"kitchen"|"receipt"|"test";destination?:"kitchen"|"cashier";label?:string}) {
 const t=useTranslation();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const pending=useRef<PendingPrintRequest|null>(null);const [recovering,setRecovering]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>{try{pending.current=loadPrintRequest(sessionStorage,{order_id:orderId,job_id:jobId,kind,destination});setRecovering(!!pending.current);}catch{setMessage(t("Não foi possível recuperar a solicitação. Confira a fila."));}},0);return()=>clearTimeout(timer);},[orderId,jobId,kind,destination,t]);
 return <div><button type="button" className="ghost-button" disabled={busy} onClick={async()=>{
  if(busy)return;
  try{pending.current??=loadPrintRequest(sessionStorage,{order_id:orderId,job_id:jobId,kind,destination});}catch{setMessage(t("Não foi possível recuperar a solicitação. Confira a fila."));return;}
  if(!pending.current&&jobId&&!window.confirm(t("Confirme que o processador anterior parou e confira o papel antes de reimprimir. Continuar?")))return;
  const value=pending.current??{action:"request" as const,request_id:uuid(),kind,order_id:orderId,job_id:jobId,destination};
  try{savePrintRequest(sessionStorage,value);}catch{setMessage(t("Habilite o armazenamento do navegador para guardar a solicitação antes de imprimir."));return;}
  pending.current=value;setBusy(true);setRecovering(true);
  try {await customerApi("/api/staff/printing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value),signal:AbortSignal.timeout(10000)});clearPrintRequest(sessionStorage,value);pending.current=null;setRecovering(false);setMessage(t("Trabalho adicionado à fila."));await processBrowserPrint();}
  catch(error){if(error instanceof CustomerApiError&&error.status>=400&&error.status<500&&![401,429].includes(error.status)){clearPrintRequest(sessionStorage,value);pending.current=null;setRecovering(false);}setMessage(t("Confira a fila antes de tentar novamente."));}finally{setBusy(false);}
 }}>{t(recovering?"Consultar envio":label)}</button>{message&&<p role="status">{message}</p>}</div>;
}
