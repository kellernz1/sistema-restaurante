import { buildPrintDocument } from "../src/features/printing/document.ts";
import { renderEscPos } from "../src/features/printing/escpos.ts";
import { printRpc,withPrintDeadline,PRINT_DRIVER_TIMEOUT_MS } from "./printing-deadline.mjs";

export async function processOnePrint({ db, owner, driver, appUrl, driverTimeout=PRINT_DRIVER_TIMEOUT_MS }) {
  const claim = await printRpc(db,"claim_print_job", { p_owner_id: owner, p_driver: "file" });
  if (claim.error) throw claim.error;
  const job = claim.data;
  if (!job) return null;
  async function finish(status, error) {
    const result = await printRpc(db,"finish_print_job", { p_job_id: job.id, p_owner_id: owner, p_token: job.claim_token, p_status: status, p_error: error ?? null });
    if (result.error) throw result.error;
  }
  let document, bytes;
  try { document = buildPrintDocument(job, appUrl); bytes = renderEscPos(document, job.device); }
  catch { await finish("failed", "Document generation failed; check configuration"); return "failed"; }
  await finish("uncertain", "Transport started; completion not acknowledged");
  let result;
  try{result = await withPrintDeadline(signal=>driver.deliver(job, document, bytes,{signal}),driverTimeout,"Print driver");}
  catch{result={status:"uncertain",error:"Driver timed out or failed after dispatch began; inspect output"};}
  await finish(result.status, result.error);
  return result.status;
}
