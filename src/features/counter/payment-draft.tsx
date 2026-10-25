"use client";
import { useTranslation } from "@/components/language-provider";
import { brl, brlCentsFor, money, paymentLabels, type PaymentConfig, type PaymentLine, type PaymentMethod } from "@/lib/money";
export type CounterPaymentDraft = { method: PaymentMethod; currency: "PYG" | "BRL"; allocation: number | null; received: number | null };
export function counterPaymentLines(rows: CounterPaymentDraft[], total: number, config: PaymentConfig): PaymentLine[] {
  let remaining = total;
  return rows.map((row) => {
    const amount = row.allocation ?? Math.max(0, remaining); remaining -= amount;
    let original = amount;
    if (row.currency === "BRL") {
      if (!config.rate) throw new Error("Exchange rate unavailable");
      original = brlCentsFor(amount, config.rate.rate, config.rate.rounding);
    }
    return { method: row.method, currency: row.currency, amount_pyg: amount, original_amount: row.received ?? original, ...(row.currency === "BRL" && config.rate ? { rate_id: config.rate.id } : {}) };
  });
}
export function CounterPaymentEditor({ rows, onChange, total, config, disabled }: { rows: CounterPaymentDraft[]; onChange: (rows: CounterPaymentDraft[]) => void; total: number; config: PaymentConfig; disabled: boolean }) {
  const t = useTranslation();
  let lines: PaymentLine[] = [];
  try { lines = counterPaymentLines(rows, total, config); } catch { /* Invalid drafts cannot be submitted. */ }
  function update(index: number, changes: Partial<CounterPaymentDraft>) { onChange(rows.map((row, i) => i === index ? { ...row, ...changes, received: null } : row)); }
  return <fieldset disabled={disabled}><legend>{t("Pagamento no balcão")}</legend>{rows.map((row, index) => <div key={index} className="counter-payment-row">
    <label>{t("Forma de pagamento")}<select className="order-input" value={row.method} onChange={(event) => update(index, { method: event.target.value as PaymentMethod, currency: event.target.value === "pix" ? "BRL" : "PYG" })}>{config.enabled_methods.map((method) => <option key={method} value={method} disabled={method === "pix" && !config.rate}>{t(paymentLabels[method])}</option>)}</select></label>
    <label>{t("Moeda paga")}<select className="order-input" value={row.currency} onChange={(event) => update(index, { currency: event.target.value as "PYG" | "BRL" })}><option value="PYG" disabled={row.method === "pix"}>PYG</option><option value="BRL" disabled={row.method === "cash" || !config.rate}>BRL</option></select></label>
    <label>{t("Valor em guaraníes")}<input className="order-input" type="number" min="0" step="1" value={row.allocation ?? lines[index]?.amount_pyg ?? ""} onChange={(event) => update(index, { allocation: Number(event.target.value) })} /></label>
    <p>{t("Valor a receber")}: {lines[index] ? row.currency === "BRL" ? brl.format(lines[index].original_amount) : money.format(lines[index].original_amount) : "—"}</p>
    {row.method === "cash" && <label>{t("Dinheiro recebido na moeda selecionada")}<input className="order-input" type="number" min="0" step={row.currency === "BRL" ? "0.01" : "1"} value={row.received === null ? "" : row.currency === "BRL" ? row.received / 100 : row.received} onChange={(event) => onChange(rows.map((value, i) => i === index ? { ...value, received: event.target.value === "" ? null : row.currency === "BRL" ? Math.round(Number(event.target.value) * 100) : Number(event.target.value) } : value))} /><small>{t("Troco estimado em guaraníes")}: {lines[index] ? money.format(Math.max(0, Math.round(lines[index].original_amount * (row.currency === "BRL" ? Number(config.rate?.rate ?? 0) / 100 : 1)) - lines[index].amount_pyg)) : "—"}</small></label>}
    <button type="button" className="back-link" onClick={() => onChange(rows.filter((_, i) => i !== index))}>{t("Remover pagamento")}</button>
  </div>)}<p>{t("Valor restante")}: {money.format(Math.max(0, total - lines.reduce((sum, line) => sum + line.amount_pyg, 0)))}</p>
    <button type="button" className="ghost-button" disabled={rows.length >= 20} onClick={() => { const method = config.enabled_methods.find((value) => value !== "pix" || config.rate); if (method) onChange([...rows, { method, currency: method === "pix" ? "BRL" : "PYG", allocation: null, received: null }]); }}>{t("Adicionar pagamento")}</button>
  </fieldset>;
}
