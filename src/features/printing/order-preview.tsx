import { notFound,redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/staff-api";
import { PublicApiError } from "@/lib/public-table-api";
import { buildPrintDocument,type PrintDevice,type PrintSnapshot } from "./document";
import { PrintDocumentView } from "./document-view";
import { ReceiptPrintButton } from "@/features/counter/receipt-print-button";

export async function OrderPrintPreview({orderId,kind}:{orderId:string;kind:"kitchen"|"receipt"}) {
 const {db}=await requireStaff(kind==="receipt"?["admin","cashier"]:["admin","cashier","kitchen","waiter"]).catch(error=>{
  if(error instanceof PublicApiError && error.status===401)redirect("/login");
  if(error instanceof PublicApiError && error.status===403)redirect("/unauthorized");throw error;
 });
 if(!z.uuid().safeParse(orderId).success)notFound();
 const result=await db.rpc("preview_print_order",{p_order_id:orderId,p_kind:kind});
 if(result.error || !result.data)notFound();
 const data=result.data as unknown as {snapshot:PrintSnapshot | null;device:PrintDevice};
 if(!data.snapshot)notFound();
 return <><ReceiptPrintButton orderId={orderId} kind={kind}/><main data-counter-receipt={kind==="receipt"?orderId:undefined} data-kitchen-ticket={kind==="kitchen"?orderId:undefined}><PrintDocumentView document={buildPrintDocument({kind,reprint:false,additional:false,snapshot:data.snapshot,device:data.device},process.env.NEXT_PUBLIC_APP_URL!)} /></main></>;
}
