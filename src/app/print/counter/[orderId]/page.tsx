import { OrderPrintPreview } from "@/features/printing/order-preview";
import "../../jobs/printing.css";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function PrintPage({params}:{params:Promise<{orderId:string}>}) {return <OrderPrintPreview orderId={(await params).orderId} kind="receipt" />;}
