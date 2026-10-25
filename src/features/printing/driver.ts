import type { PrintDocument, PrintJob } from "./document.ts";

export type DriverResult = { status: "sent" | "failed" | "uncertain"; error?: string };
/** Network and Windows spooler implementations belong behind this transport contract in block 4B. */
export interface PrintDriver {
  deliver(job: PrintJob, document: PrintDocument, bytes: Uint8Array, options?: {signal?:AbortSignal}): Promise<DriverResult>;
}
