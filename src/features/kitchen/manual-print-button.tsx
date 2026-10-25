"use client";
import { PrintRequestButton } from "@/features/printing/print-request-button";
export function ManualPrintButton({orderId}:{orderId:string}) { return <PrintRequestButton orderId={orderId} />; }
