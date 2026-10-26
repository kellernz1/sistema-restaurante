"use client";
import { useRef, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { customerApi, CustomerApiError } from "@/features/customer-ordering/public-client";
import { uuid } from "@/lib/uuid";
import { clearPrintRequest, loadPrintRequest, savePrintRequest } from "@/features/printing/pending-request";
import type { PrintJob } from "@/features/printing/document";

export function PrintBulkActions({ jobs, selected, setSelected, admin, refresh }: {
  jobs: PrintJob[]; selected: string[]; setSelected: (ids: string[]) => void; admin: boolean; refresh: () => void;
}) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const visible = jobs.filter(job => !job.archived_at);
  const chosen = visible.filter(job => selected.includes(job.id));
  const reprintable = chosen.length > 0 && chosen.every(job => !["processing", "uncertain"].includes(job.status));
  async function run(action: "reprint" | "discard") {
    if (lock.current || !chosen.length || (action === "discard" ? !admin : !reprintable)) return;
    const prompt = action === "discard"
      ? t("Arquivar {0} trabalhos sem imprimir? Nenhum deles será enviado.")
      : t("Reimprimir {0} trabalhos? Confira o papel e confirme que o processador anterior parou.");
    if (!window.confirm(prompt.replace("{0}", String(chosen.length)))) return;
    lock.current = true; setBusy(true); setMessage("");
    let completed = 0;
    try {
      for (const job of chosen) {
        const target = { job_id: job.id, kind: "kitchen" as const, destination: "kitchen" as const };
        const key = `mesa-print-discard:${job.id}`;
        const value = action === "reprint"
          ? loadPrintRequest(sessionStorage, target) ?? { ...target, action: "request" as const, request_id: uuid() }
          : { action: "review" as const, job_id: job.id, decision: "discard", request_id: sessionStorage.getItem(key) ?? uuid() };
        if (action === "reprint") savePrintRequest(sessionStorage, value as Parameters<typeof savePrintRequest>[1]);
        else sessionStorage.setItem(key, value.request_id);
        try {
          await customerApi("/api/staff/printing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value), signal: AbortSignal.timeout(10000) });
        } catch (error) {
          if (error instanceof CustomerApiError && error.status >= 400 && error.status < 500 && ![401,429].includes(error.status)) {
            if (action === "reprint") clearPrintRequest(sessionStorage, value as Parameters<typeof clearPrintRequest>[1]);
            else sessionStorage.removeItem(key);
          }
          throw error;
        }
        if (action === "reprint") clearPrintRequest(sessionStorage, value as Parameters<typeof clearPrintRequest>[1]);
        else sessionStorage.removeItem(key);
        completed++;
        setSelected(chosen.slice(completed).map(item => item.id));
      }
      setMessage(t("Concluídos: {0}.").replace("{0}", String(completed)));
    } catch {
      setMessage(t("Concluídos: {0}. Operação interrompida. Confira a fila antes de continuar; não há reenvio automático.").replace("{0}", String(completed)));
    } finally { lock.current = false; setBusy(false); refresh(); }
  }
  return <div className="print-bulk">
    <label><input type="checkbox" disabled={busy || !visible.length} checked={visible.length > 0 && visible.every(job => selected.includes(job.id))} onChange={event => setSelected(event.target.checked ? visible.map(job => job.id) : [])}/>{t("Selecionar todos exibidos neste filtro")}</label>
    {!!chosen.length && <><strong>{t("{0} selecionados").replace("{0}", String(chosen.length))}</strong>
      <button type="button" className="ghost-button" disabled={busy || !reprintable} onClick={() => void run("reprint")}>{t("Reimprimir selecionados")}</button>
      {admin && <button type="button" className="ghost-button" disabled={busy} onClick={() => void run("discard")}>{t("Arquivar selecionados sem imprimir")}</button>}
      <button type="button" className="back-link" disabled={busy} onClick={() => setSelected([])}>{t("Limpar seleção")}</button>
      {!reprintable && <small>{t("Trabalhos em processamento ou incertos não podem ser reimpressos em lote.")}</small>}
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
