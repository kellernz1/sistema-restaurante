import Link from "next/link";
import {notFound} from "next/navigation";
import {z} from "zod";
import {requireStaff} from "@/lib/staff-api";
import {getTranslation} from "@/lib/i18n/server";
import {buildPrintDocument,type PrintDevice} from "@/features/printing/document";
import {PrintDocumentView} from "@/features/printing/document-view";
import {CashSessionPrintButton} from "@/features/cash-sessions/session-print-button";
import type {CashReport} from "@/features/cash-sessions/types";
import "../../jobs/printing.css";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function CashSessionPrintPage({params}:{params:Promise<{sessionId:string}>}){
 const {db}=await requireStaff(["admin","cashier"]);const t=await getTranslation();const id=(await params).sessionId;if(!z.uuid().safeParse(id).success)notFound();
 const report=await db.rpc("cash_session_report",{p_session:id});if(report.error||!report.data)notFound();const value=report.data as unknown as CashReport;if(value.session.status!=="closed")notFound();
 const [settings,destination]=await Promise.all([db.from("restaurant_settings").select("restaurant_name").eq("id",true).single(),db.from("print_destinations").select("print_devices(*)").eq("name","cashier").single()]);
 if(settings.error||destination.error||!destination.data.print_devices)notFound();
 const document=buildPrintDocument({kind:"cash_session",reprint:false,additional:false,device:destination.data.print_devices as PrintDevice,snapshot:{restaurant:settings.data.restaurant_name,date:value.closed_at,timezone:value.session.timezone,cash_report:value}},process.env.NEXT_PUBLIC_APP_URL!);
 return <><nav className="counter-receipt-controls"><Link className="ghost-button" href="/cashier/sessions">{t("Turnos de caixa")}</Link><CashSessionPrintButton sessionId={id} revision={value.session.revision}/></nav><PrintDocumentView document={document}/></>;
}
