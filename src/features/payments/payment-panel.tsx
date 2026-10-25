"use client";

import { useCallback, useEffect, useRef, useState,type ReactNode } from "react";
import { useTranslation } from "@/components/language-provider";
import { customerApi, CustomerApiError } from "@/features/customer-ordering/public-client";
import { brl, brlCentsFor, money, MAX_MONEY, paymentLabels, type PaymentConfig, type PaymentLine, type PaymentMethod } from "@/lib/money";
import { uuid } from "@/lib/uuid";
import { paymentRequestSchema } from "./validation";
import { paymentErrorMessage } from "./payment-error";

type Recorded = { id: string; method: PaymentMethod; currency: string; original_amount: number; equivalent_pyg: number; change_pyg: number; exchange_rate: string | null };
type Draft = { method: PaymentMethod; currency: "PYG" | "BRL"; amount_pyg: number; received: number | null };
export function PaymentPanel({ orderId, total, closed, onRecorded, onBusyChange,secondaryAction }: { orderId: string; total: number; closed: boolean; onRecorded: (closed: boolean) => void | Promise<void>; onBusyChange?: (busy: boolean) => void;secondaryAction?:ReactNode }) {
  const t = useTranslation();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [history, setHistory] = useState<Recorded[]>([]);
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ request_id: string; lines: PaymentLine[] } | null>(null);
  const lock = useRef(false);
  const load = useCallback(async () => {
    const [configuration, payments] = await Promise.all([customerApi<PaymentConfig>("/api/staff/payment-settings"), customerApi<Recorded[]>(`/api/staff/orders/${orderId}/payments`)]);
    setConfig(configuration); setHistory(payments);
  }, [orderId]);
  const storageKey = `payment-pending:${orderId}`;
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(async () => {
      try {
        const stored = sessionStorage.getItem(storageKey);
        const parsed = stored ? paymentRequestSchema.safeParse(JSON.parse(stored)) : null;
        if (parsed?.success && !closed) { pending.current = parsed.data; setUncertain(true); }
        if (closed) sessionStorage.removeItem(storageKey);
      } catch { /* Retrying in the same mounted screen still preserves the UUID. */ }
      if (alive) await load();
    }).catch(() => { if (alive) setError(t("Não foi possível carregar os pagamentos.")); });
    return () => { alive = false; };
  }, [load, t, storageKey, closed]);
  const paid = history.reduce((sum, row) => sum + row.equivalent_pyg - row.change_pyg, 0);
  const remaining = Math.max(0, total - paid);
  const allocated = rows.reduce((sum, row) => sum + row.amount_pyg, 0);
  function received(row: Draft) {
    if (row.received !== null) return row.received;
    if (row.currency === "PYG") return row.amount_pyg;
    try { return config?.rate ? brlCentsFor(row.amount_pyg, config.rate.rate, config.rate.rounding) : 0; } catch { return 0; }
  }
  function update(index: number, changes: Partial<Draft>) { setRows((current) => current.map((row, i) => i === index ? { ...row, ...changes, received: null } : row)); }
  async function submit() {
    if (lock.current || !config) return;
    if (!pending.current) pending.current = { request_id: uuid(), lines: rows.map((row) => ({ method: row.method, currency: row.currency, amount_pyg: row.amount_pyg, original_amount: received(row), ...(row.currency === "BRL" && config.rate ? { rate_id: config.rate.id } : {}) })) };
    try { sessionStorage.setItem(storageKey, JSON.stringify(pending.current)); } catch { /* Storage is optional; keep the in-memory request. */ }
    lock.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try {
      const result = await customerApi<{ order: { status: string } }>(`/api/staff/orders/${orderId}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      pending.current = null; try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
      setUncertain(false); setRows([]);
      await load().catch(() => {});
      await Promise.resolve(onRecorded(result.order.status === "closed")).catch(() => {});
    } catch (failure) {
      const known = failure instanceof CustomerApiError && failure.status >= 400 && failure.status < 500;
      if (known) { pending.current = null; try { sessionStorage.removeItem(storageKey); } catch { /* Storage is optional. */ } setUncertain(false); await load().catch(() => {}); }
      else setUncertain(true);
      setError(t(paymentErrorMessage(failure)));
    } finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  }
  const invalid = !config || !rows.length || allocated > remaining || rows.some((row) => !Number.isSafeInteger(row.amount_pyg) || row.amount_pyg < 0 || row.amount_pyg > MAX_MONEY || (row.amount_pyg === 0 && total !== 0) || received(row) < 0 || (row.currency === "BRL" && !config.rate));
  return <section className="payment-panel" aria-label={t("Pagamentos")}><div className="payment-panel-content">
    <h3>{t("Pagamentos")}</h3>
    {history.map((row) => <p key={row.id}>{t(paymentLabels[row.method])} · {row.currency === "BRL" ? brl.format(row.original_amount) : money.format(row.original_amount)} · {money.format(row.equivalent_pyg - row.change_pyg)}{row.exchange_rate !== null && <> · {t("Cotação aplicada")}: {row.exchange_rate}</>}{row.change_pyg > 0 && <> · {t("Troco")}: {money.format(row.change_pyg)}</>}</p>)}
    {!closed && <><div className="payment-summary"><p>{t("Valor restante")}: <strong>{money.format(remaining)}</strong></p><p>{t("Saldo após estes pagamentos")}: <strong>{money.format(Math.max(0, remaining - allocated))}</strong></p></div>
      {config?.rate && <p className="payment-rate">{t("Cotação atual")}: {config.rate.rate} / {brl.format(100)}</p>}
      {!rows.length&&<p className="payment-empty">{t("Adicione uma forma de pagamento para continuar.")}</p>}
      {rows.map((row, index) => <fieldset className="payment-entry" key={index} disabled={busy || uncertain}><legend>{t("Pagamento")} {index+1}</legend><div className="payment-entry-fields">
        <label className="field-group">{t("Forma de pagamento")}<select className="order-input" value={row.method} onChange={(event) => update(index, { method: event.target.value as PaymentMethod, currency: event.target.value === "pix" ? "BRL" : "PYG" })}>{config?.enabled_methods.map((method) => <option key={method} value={method} disabled={method === "pix" && !config.rate}>{t(paymentLabels[method])}</option>)}</select></label>
        <label className="field-group">{t("Moeda paga")}<select className="order-input" value={row.currency} onChange={(event) => update(index, { currency: event.target.value as "PYG" | "BRL" })}><option value="PYG" disabled={row.method === "pix"}>PYG</option><option value="BRL" disabled={row.method === "cash" || !config?.rate}>BRL</option></select></label>
        <label className="field-group">{t("Valor em guaraníes")}<input className="order-input" type="number" min="0" max={remaining} step="1" value={Number.isNaN(row.amount_pyg) ? "" : row.amount_pyg} onChange={(event) => update(index, { amount_pyg: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>
        <p className="payment-amount-hint">{t("Valor a receber")}: <strong>{row.currency === "BRL" ? brl.format(received(row)) : money.format(received(row))}</strong></p>
        {row.method === "cash" && <><label className="field-group">{t("Dinheiro recebido na moeda selecionada")}<input className="order-input" type="number" min="0" step={row.currency === "BRL" ? "0.01" : "1"} value={row.received === null ? "" : row.currency === "BRL" ? row.received / 100 : row.received} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, received: event.target.value === "" ? null : (row.currency === "BRL" ? Math.round(Number(event.target.value) * 100) : Number(event.target.value)) } : item))} /></label><p>{t("Troco estimado em guaraníes")}: {money.format(Math.max(0, Math.round(received(row) * (row.currency === "BRL" ? Number(config?.rate?.rate ?? 0) / 100 : 1)) - row.amount_pyg))}</p></>}
        <button type="button" className="back-link payment-remove" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>{t("Remover pagamento")}</button>
      </div></fieldset>)}
    </>}</div>
    {!closed&&<footer className="payment-panel-footer">
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="cashier-actions payment-panel-actions">{secondaryAction}<button type="button" className="ghost-button" disabled={!config || busy || uncertain || rows.length >= 20} onClick={() => { const method = config!.enabled_methods.find((value) => value !== "pix" || config!.rate); if (method) setRows((current) => [...current, { method, currency: method === "pix" ? "BRL" : "PYG", amount_pyg: Math.max(0, remaining - allocated), received: null }]); }}>{t("Adicionar pagamento")}</button><button type="button" className="primary-button" disabled={busy || (!uncertain && invalid)} onClick={() => void submit()}>{t(uncertain ? "Consultar envio" : "Registrar pagamentos")}</button></div>
      <p className="payment-disclaimer">{t("O pedido fecha quando o saldo é quitado. Pix é registrado pela equipe, sem confirmação bancária automática.")}</p>
    </footer>}
    {closed&&error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
