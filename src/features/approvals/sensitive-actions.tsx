"use client";
import { useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { money } from "@/lib/money";
import { uuid } from "@/lib/uuid";
import { approvalFailureMessage } from "./pin-feedback";
import type { SensitiveOperation } from "./validation";
import { Modal } from "@/components/ui-modal";

type Quote = { binding: string; requires_approval: boolean; operation: { amount: number } };
type Configuration = { approvers: { id: string; name: string; role: string }[]; policy: { discount_reasons: string[] } };
export async function approvalRequest(payload?: object) {
  const response = await fetch("/api/staff/approvals", payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
  return result;
}
export function SensitiveActions({ orderId, items = [], onChanged }: { orderId: string; items?: { id: string; name: string }[]; onChanged: () => void }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [action, setAction] = useState<SensitiveOperation["action"]>("discount"), [target, setTarget] = useState(orderId);
  const [mode, setMode] = useState<"amount" | "percent">("amount"), [value, setValue] = useState(""), [reason, setReason] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null), [operation, setOperation] = useState<SensitiveOperation | null>(null);
  const [config, setConfig] = useState<Configuration | null>(null), [approver, setApprover] = useState(""), [pin, setPin] = useState("");
  const [configLoading, setConfigLoading] = useState(false), [hasPending, setHasPending] = useState(false);
  const storageKey = `sensitive-action:${orderId}`;
  async function refreshApprovers() {
    setConfigLoading(true); setError("");
    try {
      const next: Configuration = await approvalRequest();
      setConfig(next);
      setApprover(current => next.approvers.some(a => a.id === current) ? current : "");
    } catch (e) { setError((e as Error).message); } finally { setConfigLoading(false); }
  }
  async function start() {
    setOpen(true); setError(""); setPin(""); setApprover(""); setQuote(null); setOperation(null);
    setHasPending(!!sessionStorage.getItem(storageKey));
    await refreshApprovers();
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const pending = sessionStorage.getItem(storageKey);
      if (pending) {
        await approvalRequest(JSON.parse(pending)); sessionStorage.removeItem(storageKey); setHasPending(false); setOpen(false); onChanged(); return;
      }
      if (!quote || !operation) {
        const op: SensitiveOperation = { action, target: action === "cancel_item" ? target : orderId, reason, ...(action === "discount" ? { mode, value: mode === "percent" ? Math.round(Number(value) * 100) : Number(value) } : {}) };
        setQuote(await approvalRequest({ command: "quote", operation: op })); setOperation(op); return;
      }
      let authorization: string | null = null;
      if (quote.requires_approval) {
        if (!config?.approvers.length) throw new Error(t("Nenhum aprovador com PIN cadastrado. Peça ao administrador ou supervisor para configurar o próprio PIN."));
        if (!config.approvers.some(a => a.id === approver) || !/^\d{4,6}$/.test(pin)) throw new Error(t("Selecione um aprovador e informe o PIN numérico de 4 a 6 dígitos."));
        const response = await approvalRequest({ command: "approve", request: uuid(), approver, pin, operation, binding: quote.binding });
        setPin("");
        if (!response.ok) throw new Error(approvalFailureMessage(response,t));
        authorization = response.authorization;
      }
      const payload = { command: "execute", request: uuid(), operation, binding: quote.binding, authorization };
      // Persist only the exact financial request, never the PIN or password.
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
      setHasPending(true);
      await approvalRequest(payload); sessionStorage.removeItem(storageKey); setHasPending(false); setOpen(false); onChanged();
    } catch (e) {
      setPin(""); setError((e as Error).message);
      if ((e as Error & { status?: number }).status === 409) { sessionStorage.removeItem(storageKey); setHasPending(false); setQuote(null); setOperation(null); }
    } finally { setBusy(false); }
  }
  function close() { setOpen(false); setPin(""); setQuote(null); setOperation(null); }
  return <><button type="button" className="ghost-button" onClick={() => void start()}>{t("Descontos e cancelamentos")}</button><Modal open={open} title={t("Descontos e cancelamentos")} closeLabel={t("Fechar confirmação")} busy={busy} onRequestClose={close}
    footer={<><div className="approval-actions"><button type="button" disabled={busy} onClick={close}>{t("Cancelar")}</button><button type="button" className="primary-button" disabled={busy || (!hasPending && !!quote?.requires_approval && (configLoading || !config?.approvers.some(a => a.id === approver) || !/^\d{4,6}$/.test(pin)))} onClick={() => void submit()}>{t(hasPending ? "Consultar envio" : quote ? "Confirmar ação" : "Conferir operação")}</button></div><p>{t("Se houver falha de conexão, tente novamente para recuperar a mesma operação.")}</p></>}>
    {!quote ? <><label>{t("Ação")}<select value={action} onChange={e => setAction(e.target.value as typeof action)}><option value="discount">{t("Desconto no pedido")}</option><option value="cancel_order">{t("Cancelar pedido")}</option>{items.length > 0 && <option value="cancel_item">{t("Cancelar item")}</option>}</select></label>
      {action === "cancel_item" && <label>{t("Item")}<select value={target} onChange={e => setTarget(e.target.value)}><option value="">{t("Selecione")}</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
      {action === "discount" && <><label>{t("Tipo de desconto")}<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="amount">Gs.</option><option value="percent">%</option></select></label><label>{t("Valor")}<input type="number" min="0" step={mode === "percent" ? "0.01" : "1"} value={value} onChange={e => setValue(e.target.value)} /></label></>}
      <label>{t("Motivo obrigatório")}<input list={`reasons-${orderId}`} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /><datalist id={`reasons-${orderId}`}>{config?.policy.discount_reasons.map(r => <option key={r} value={r} />)}</datalist></label></> : <><p>{t("Valor da operação")}: <strong>{money.format(quote.operation.amount)}</strong></p><p>{operation?.reason}</p>{quote.requires_approval && <>
        {configLoading ? <p role="status">{t("Carregando aprovadores...")}</p> : config && !config.approvers.length ? <div role="status"><p>{t("Nenhum aprovador com PIN cadastrado. Peça ao administrador ou supervisor para configurar o próprio PIN.")}</p><p>{t("Administrador: Configurações → Segurança e aprovações → Meu PIN de aprovação. Supervisor: Aprovações → Meu PIN de aprovação.")}</p></div> : null}
        <button type="button" className="ghost-button" disabled={busy || configLoading} onClick={() => void refreshApprovers()}>{t("Atualizar aprovadores")}</button>
        {!!config?.approvers.length && <><label>{t("Aprovador")}<select value={approver} onChange={e => { setApprover(e.target.value); setPin(""); setError(""); }}><option value="">{t("Selecione")}</option>{config.approvers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>{t("PIN de aprovação")}<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={e => setPin(e.target.value)} /></label><p>{t("Digite o PIN numérico de aprovação do responsável selecionado, não a senha de login.")}</p></>}
      </>}</>}
    {error && <p role="alert" className="approval-feedback">{t(error)}</p>}
  </Modal></>;
}
