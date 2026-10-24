"use client";

import { useTranslation } from "@/components/language-provider";


import { useRef, useState } from "react";
import { customerApi } from "@/features/customer-ordering/public-client";
import { printKitchenTicket } from "./print-ticket";

export function ManualPrintButton({ orderId }: { orderId: string }) {
  const t = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  return <div className="manual-kitchen-print"><button type="button" className="ghost-button" disabled={busy} onClick={async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      await printKitchenTicket(orderId, async () => { await customerApi("/api/staff/kitchen-print", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "manual", order_id: orderId }) }); });
      setMessage(t("Janela de impressão encerrada. Confira a saída na impressora."));
    } catch (failure) { setMessage(failure instanceof Error ? failure.message : t("Não foi possível imprimir. Tente novamente.")); }
    finally { lock.current = false; setBusy(false); }
  }}>{t(busy ? t("Preparando impressão...") : t("Imprimir comanda da cozinha"))}</button>{message && <p role="status">{t(message)}</p>}</div>;
}
