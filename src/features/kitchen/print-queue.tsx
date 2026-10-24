"use client";

import { useTranslation } from "@/components/language-provider";


import { useEffect, useState, useSyncExternalStore } from "react";
import { Printer } from "lucide-react";

import { customerApi } from "@/features/customer-ordering/public-client";
import { uuid } from "@/lib/uuid";
import { ManualPrintButton } from "./manual-print-button";
import { printKitchenTicket } from "./print-ticket";

const storageKey = "mesa-certa-kitchen-auto-print";
const changeEvent = "kitchen-printer-change";
let fallbackEnabled = false;
function isEnabled() { try { return localStorage.getItem(storageKey) === "true"; } catch { return fallbackEnabled; } }
function subscribe(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener(changeEvent, callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener(changeEvent, callback); }; }
function toggleEnabled() { fallbackEnabled = !isEnabled(); try { localStorage.setItem(storageKey, String(fallbackEnabled)); } catch { /* Browser storage is optional. */ } window.dispatchEvent(new Event(changeEvent)); }
type Job = { id: string; order_id: string; status: string; error_message: string | null; orders: { order_number: number; order_type: string; tables: { table_number: number } | null } | null };
type Queue = { jobs: Job[]; enabled: boolean; pending: number };
type Claim = { id?: string; order_id?: string; claim_token?: string; busy?: boolean; disabled?: boolean };
const labels: Record<string, string> = { pending: "Aguardando", claimed: "Preparando impressão", dispatched: "Enviada ao navegador", error: "Conferir / reimprimir", skipped: "Pedido encerrado" };

export function KitchenPrintQueue() {
  const t = useTranslation();
  const enabled = useSyncExternalStore(subscribe, isEnabled, () => false);
  const [terminalId] = useState(uuid);
  const [queue, setQueue] = useState<Queue>({ jobs: [], enabled: true, pending: 0 });
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function command(body: object) { return customerApi<Claim>("/api/staff/kitchen-print", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
    async function tick() {
      let claim: Claim | null = null;
      try {
        const current = await customerApi<Queue>("/api/staff/kitchen-print");
        if (!alive) return;
        setQueue(current);
        if (enabled && current.enabled && document.visibilityState === "visible") {
          claim = await command({ action: "claim", terminal_id: terminalId });
          if (!alive) return;
          if (claim.busy) setMessage(t("Outro computador ou aba está atendendo a impressão automática. Deixe apenas o computador da cozinha ativado."));
          else if (claim.disabled) setMessage(t("Impressão automática desativada nas configurações."));
          else if (claim.id && claim.order_id && claim.claim_token) {
            const job = claim;
            setMessage(t("Preparando a comanda para impressão..."));
            await printKitchenTicket(claim.order_id, async () => {
              if (!alive) throw new Error(t("Impressão interrompida. Confira a fila e imprima manualmente se necessário."));
              await command({ action: "finish", terminal_id: terminalId, job_id: job.id, claim_token: job.claim_token });
            });
            if (alive) setMessage(t("Janela de impressão encerrada. Confira a saída; se houve erro ou cancelamento, use a impressão manual."));
          }
        }
      } catch (failure) {
        const error = failure instanceof Error ? failure.message : t("Não foi possível imprimir. Confira a conexão e use a opção manual.");
        if (claim?.id && claim.claim_token) {
          try { await command({ action: "finish", terminal_id: terminalId, job_id: claim.id, claim_token: claim.claim_token, error: error.slice(0, 300) }); } catch { /* Keep uncertain jobs for manual review. */ }
        }
        if (alive) setMessage(error);
      } finally { if (alive) timer = setTimeout(tick, 5000); }
    }
    void tick();
    return () => {
      alive = false; clearTimeout(timer);
      void command({ action: "release", terminal_id: terminalId }).catch(() => {});
    };
  }, [enabled, terminalId, t]);

  return <section className="kitchen-print-queue order-panel" aria-label={t("Impressão da cozinha")}>
    <div className="kitchen-print-heading"><div><h2><Printer size={22} aria-hidden="true" /> {t(" Impressão da cozinha")}</h2><p>{t(queue.pending)} {t(queue.pending === 1 ? "comanda aguardando" : "comandas aguardando")} · {t(enabled && queue.enabled ? t("Automática neste computador") : t("Impressão manual disponível"))}</p></div><button type="button" className={enabled ? "ghost-button" : "primary-button"} aria-pressed={enabled} onClick={toggleEnabled}>{t(enabled ? t("Desativar neste computador") : t("Ativar neste computador"))}</button></div>
    <p>{t("Deixe esta tela aberta no computador da cozinha. Sem impressora, use Salvar como PDF. O navegador abre a janela de impressão; a saída direta depende da configuração da impressora.")}</p>
    {!queue.enabled && <p role="status">{t("A impressão automática está desativada nas Configurações → Impressão.")}</p>}
    {message && <p role="status">{t(message)}</p>}
    <details><summary>{t("Conferir fila e imprimir manualmente")}</summary>{!queue.jobs.length && <p>{t("Os próximos pedidos confirmados aparecerão aqui.")}</p>}{queue.jobs.map((job) => <article className="kitchen-print-job" key={job.id}><div><strong>{t("Pedido #")}{t(job.orders?.order_number ?? "—")}{t(job.orders?.tables ? t(` · Mesa ${job.orders.tables.table_number}`) : "")}</strong><p>{t(labels[job.status] ?? job.status)}</p>{job.error_message && <p className="form-error">{t(job.error_message)}</p>}</div><ManualPrintButton orderId={job.order_id} /></article>)}</details>
    <small>{t("“Enviada ao navegador” não confirma saída no papel. Se cancelar a janela ou faltar papel, use o botão manual.")}</small>
  </section>;
}
