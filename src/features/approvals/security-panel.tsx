"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { approvalRequest } from "./sensitive-actions";
type Policy = { require_item_approval: boolean; require_order_approval: boolean; require_discount_approval: boolean; discount_limit_pyg: number; discount_limit_bps: number; pin_failures: number; pin_lock_minutes: number; authorization_seconds: number; discount_reasons: string[]; version?: number };
export function SecurityPanel({ administrator = false }: { administrator?: boolean }) {
  const t = useTranslation();
  const [policy, setPolicy] = useState<Policy | null>(null), [pin, setPin] = useState(""), [password, setPassword] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { void approvalRequest().then(r => setPolicy(r.policy)).catch(e => setNotice(e.message)); }, []);
  async function savePin() {
    setBusy(true); setNotice("");
    try { const result = await approvalRequest({ command: "pin", pin, password }); setNotice(t(result.ok ? "PIN atualizado." : "Reautenticação recusada ou limite de tentativas atingido.")); }
    catch (e) { setNotice((e as Error).message); } finally { setPin(""); setPassword(""); setBusy(false); }
  }
  async function savePolicy() {
    if (!policy) return;
    setBusy(true); setNotice("");
    try { const { version: _version, ...payload } = policy; void _version; const response = await fetch("/api/staff/security", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!response.ok) throw Error(t("Não foi possível salvar a política.")); setNotice(t("Política atualizada.")); }
    catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="security-stack"><section className="order-panel security-stack"><h2>{t("Meu PIN de aprovação")}</h2><p>{t("Use de 4 a 6 dígitos. Informe sua senha de acesso para definir ou trocar o PIN.")}</p><label>{t("Novo PIN")}<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={e => setPin(e.target.value)} /></label><label>{t("Senha de acesso")}<input type="password" autoComplete="current-password" maxLength={72} value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary-button" disabled={busy || !/^\d{4,6}$/.test(pin) || !password} onClick={() => void savePin()}>{t("Salvar PIN")}</button></section>
    {administrator && policy && <section className="order-panel security-stack"><h2>{t("Segurança e aprovações")}</h2>
      {([["require_item_approval", "Aprovar cancelamento de item enviado"], ["require_order_approval", "Aprovar cancelamento de pedido confirmado"], ["require_discount_approval", "Aprovar qualquer desconto"]] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={policy[key]} onChange={e => setPolicy({ ...policy, [key]: e.target.checked })} /> {t(label)}</label>)}
      {([["discount_limit_pyg", "Limite sem aprovação em Gs", 0, 1e12], ["discount_limit_bps", "Limite sem aprovação em centésimos de percentual", 0, 10000], ["pin_failures", "Erros antes do bloqueio", 1, 10], ["pin_lock_minutes", "Bloqueio em minutos", 1, 60], ["authorization_seconds", "Validade da autorização em segundos", 30, 300]] as const).map(([key, label, min, max]) => <label key={key}>{t(label)}<input type="number" min={min} max={max} step="1" value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: Number(e.target.value) })} /></label>)}
      <p>{t("100 centésimos = 1%. Sem aprovação, os dois limites devem ser respeitados.")}</p><label>{t("Motivos de desconto, um por linha")}<textarea value={policy.discount_reasons.join("\n")} onChange={e => setPolicy({ ...policy, discount_reasons: e.target.value.split("\n") })} /></label><button className="primary-button" disabled={busy} onClick={() => void savePolicy()}>{t("Salvar política")}</button>
    </section>}{notice && <p role="status">{t(notice)}</p>}</div>;
}
