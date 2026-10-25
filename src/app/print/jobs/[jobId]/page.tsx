import { notFound,redirect } from "next/navigation";
import { PublicApiError } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";
import { buildPrintDocument, type PrintJob } from "@/features/printing/document";
import { PrintDocumentView } from "@/features/printing/document-view";
import { ReceiptPrintButton } from "@/features/counter/receipt-print-button";
import "../printing.css";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function PrintJobPage({params}:{params:Promise<{jobId:string}>}) {
 const {db}=await requireStaff(["admin","kitchen","cashier"]).catch(error=>{
  if(error instanceof PublicApiError && error.status===401)redirect("/login");
  if(error instanceof PublicApiError && error.status===403)redirect("/unauthorized");throw error;
 });
 const {data,error}=await db.from("print_jobs").select("id,order_id,destination,kind,additional,reprint,snapshot,device,status,archived_at").eq("id",(await params).jobId).maybeSingle();
 if(error || !data) notFound();
 const job=data as unknown as PrintJob;
 return <><ReceiptPrintButton jobId={job.id} kind={job.destination==="kitchen"?"kitchen":"receipt"} label="Reimprimir" archived={!!job.archived_at} /><main data-print-job={job.id}><PrintDocumentView document={buildPrintDocument(job,process.env.NEXT_PUBLIC_APP_URL!)} /></main></>;
}
