"use client";
import Link from "next/link";
import { useTranslation } from "@/components/language-provider";
import { PrintRequestButton } from "@/features/printing/print-request-button";
export function ReceiptPrintButton({orderId,jobId,kind="receipt",label,archived=false}:{orderId?:string;jobId?:string;kind?:"receipt"|"kitchen";label?:string;archived?:boolean}) {
  const t = useTranslation();
  return <nav className="counter-receipt-controls"><Link className="ghost-button" href={kind==="kitchen"?"/kitchen":"/cashier/counter"}>{t(kind==="kitchen"?"Voltar à cozinha":"Voltar ao balcão")}</Link>{archived?<span>{t("Arquivado")}</span>:<PrintRequestButton orderId={orderId} jobId={jobId} kind={kind} label={label??(kind==="receipt"?"Imprimir comprovante":"Imprimir comanda da cozinha")} />}</nav>;
}
