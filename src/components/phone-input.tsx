"use client";
import { useTranslation } from "@/components/language-provider";
import { phoneCountries, type PhoneCountry } from "@/lib/phone";

export function PhoneInput({ value, country, defaultCountry, onChange, disabled, onBlur }: { value: string; country?: PhoneCountry; defaultCountry: PhoneCountry; onChange: (value: string, country: PhoneCountry) => void; disabled?: boolean; onBlur?: () => void }) {
  const t = useTranslation();
  const selected = country ?? defaultCountry;
  return <fieldset disabled={disabled} className="field-group"><legend>{t("Telefone")}</legend>
    <span>{t("País do telefone")}</span><div className="cashier-actions" role="group" aria-label={t("País do telefone")}>{(Object.keys(phoneCountries) as PhoneCountry[]).map((code) => <button key={code} type="button" className={selected === code ? "primary-button" : "ghost-button"} aria-pressed={selected === code} onClick={() => onChange(selected !== code && value.trim().startsWith("+") ? "" : value, code)}>{t(phoneCountries[code].label)}</button>)}</div>
    <input className="order-input" type="tel" aria-label={t("Telefone")} autoComplete="tel" maxLength={40} value={value} placeholder={selected === "PY" ? "0981 123 456" : "(11) 91234-5678"} onBlur={onBlur} onChange={(event) => {
      const raw = event.target.value;
      const explicit = raw.trim().startsWith("+595") ? "PY" : raw.trim().startsWith("+55") ? "BR" : selected;
      onChange(raw, explicit);
    }} /><small>{t("Paraguai ou Brasil: selecione o país ou cole o número com + e código internacional.")}</small>
  </fieldset>;
}
