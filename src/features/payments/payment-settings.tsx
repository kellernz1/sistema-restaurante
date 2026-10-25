"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { customerApi } from "@/features/customer-ordering/public-client";
import { paymentLabels, type PaymentConfig, type PaymentMethod, type RoundingMode } from "@/lib/money";

export function PaymentSettings() {
  const t = useTranslation();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [rate, setRate] = useState("");
  const [rounding, setRounding] = useState<RoundingMode>("none");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { void customerApi<PaymentConfig>("/api/staff/payment-settings").then((value) => { setConfig(value); setRate(value.rate?.rate ?? ""); setRounding(value.rate?.rounding ?? "none"); }).catch(() => setNotice(t("Não foi possível carregar os pagamentos."))); }, [t]);
  async function save(body: object) {
    if (busy) return;
    setBusy(true); setNotice("");
    try { await customerApi("/api/staff/payment-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setNotice(t("Configuração de pagamentos salva.")); }
    catch { setNotice(t("Não foi possível salvar a configuração de pagamentos.")); }
    finally { setBusy(false); }
  }
  return <section className="settings-fieldset"><h3>{t("Pagamentos e câmbio")}</h3>
    {config && <fieldset disabled={busy}><legend>{t("Formas habilitadas")}</legend>{(Object.keys(paymentLabels) as PaymentMethod[]).map((method) => <label className="settings-switch-row" key={method}>{t(paymentLabels[method])}<input type="checkbox" checked={config.enabled_methods.includes(method)} onChange={(event) => setConfig({ ...config, enabled_methods: event.target.checked ? [...config.enabled_methods, method] : config.enabled_methods.filter((value) => value !== method) })} /></label>)}<button type="button" className="ghost-button" disabled={!config.enabled_methods.length} onClick={() => void save({ enabled_methods: config.enabled_methods })}>{t("Salvar formas de pagamento")}</button></fieldset>}
    <label className="field-group">{t("Guaraníes por real")}<input className="order-input" type="number" min="0.01" max="100000000" step="0.00000001" value={rate} disabled={busy} onChange={(event) => setRate(event.target.value)} /></label>
    <label className="field-group">{t("Arredondamento em reais")}<select className="order-input" value={rounding} disabled={busy} onChange={(event) => setRounding(event.target.value as RoundingMode)}><option value="none">{t("Sem arredondamento adicional")}</option><option value="half_real">{t("Para cima a cada 0,50 BRL")}</option><option value="whole_real">{t("Para cima a cada 1,00 BRL")}</option></select></label>
    <p>{t("Cada alteração cria uma cotação no histórico. Pagamentos anteriores não mudam.")}</p><button type="button" className="primary-button" disabled={busy || !rate} onClick={() => void save({ rate, rounding })}>{t("Salvar nova cotação")}</button>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
