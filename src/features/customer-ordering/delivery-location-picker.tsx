"use client";

import { useTranslation } from "@/components/language-provider";


import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { coordinatesMapLink, mapLinkSchema } from "./delivery-location";

export function DeliveryLocationPicker({ value, onChange, disabled, onPendingChange }: {
  value: string; onChange: (value: string) => void; disabled: boolean; onPendingChange: (pending: boolean) => void;
}) {
  const t = useTranslation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; onPendingChange(false); }, [onPendingChange]);
  const parsed = mapLinkSchema.safeParse(value);

  function locate() {
    if (!window.isSecureContext) { setError(t("Para usar o GPS, abra o link HTTPS do cardápio. Você também pode colar um link de mapas abaixo.")); return; }
    if (!navigator.geolocation) { setError(t("Este navegador não oferece localização. Cole um link de mapas abaixo.")); return; }
    const version = ++requestVersion.current;
    setLocating(true); onPendingChange(true); setError("");
    navigator.geolocation.getCurrentPosition((position) => {
      if (version !== requestVersion.current) return;
      setLocating(false); onPendingChange(false);
      try { onChange(coordinatesMapLink(position.coords.latitude, position.coords.longitude)); setAccuracy(Math.round(position.coords.accuracy)); }
      catch { setError(t("Não foi possível obter uma localização válida. Tente novamente ou cole um link de mapas.")); }
    }, (failure) => {
      if (version !== requestVersion.current) return;
      setLocating(false); onPendingChange(false);
      setError(failure.code === 1 ? t("A localização não foi autorizada. Permita o acesso no navegador ou cole um link de mapas.") : failure.code === 3 ? t("A localização demorou para responder. Tente novamente ou cole um link de mapas.") : t("Não foi possível obter a localização. Ative a localização do aparelho ou cole um link de mapas."));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  return <section className="delivery-location-picker" aria-label={t("Localização para entrega")}>
    <h3>{t("Localização para entrega")}</h3><p>{t("Envie o ponto de entrega pelo GPS ou cole um link de mapas.")}</p>
    <button type="button" className="ghost-button" disabled={disabled || locating} onClick={locate}><MapPin size={20} aria-hidden="true" />{t(locating ? t("Obtendo localização...") : t("Usar minha localização atual"))}</button>
    {locating && <button type="button" className="back-link" onClick={() => { requestVersion.current += 1; setLocating(false); onPendingChange(false); }}>{t("Cancelar localização")}</button>}
    <label className="field-group">{t("Link do Google Maps, Apple Mapas ou Waze (opcional)")}<input className="order-input" type="url" inputMode="url" maxLength={2048} placeholder="https://maps.app.goo.gl/..." disabled={disabled || locating} value={value} onChange={(event) => { onChange(event.target.value); setAccuracy(null); setError(""); }} /></label>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    {value && !parsed.success && <p className="form-error" role="alert">{t("Cole um link HTTPS válido do Google Maps, Apple Mapas ou Waze.")}</p>}
    {parsed.success && <div className="delivery-location-confirmation"><p role="status">{t("Localização adicionada.")}{t(accuracy !== null ? t(` Precisão aproximada: ${accuracy} m.`) : "")} {t(" Confira o ponto antes de finalizar.")}</p><a className="back-link" href={parsed.data} target="_blank" rel="noopener noreferrer">{t("Conferir no mapa ›")}</a><button type="button" className="back-link" disabled={disabled} onClick={() => { onChange(""); setAccuracy(null); }}>{t("Remover localização")}</button></div>}
    <small>{t("A localização é um ponto fixo, compartilhado somente ao finalizar o pedido. Com ela, o endereço escrito é opcional. Se quiser, acrescente número, complemento ou referência para ajudar na entrega.")}</small>
  </section>;
}
