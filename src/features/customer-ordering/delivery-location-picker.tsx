"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { coordinatesMapLink, mapLinkSchema } from "./delivery-location";

export function DeliveryLocationPicker({ value, onChange, disabled, onPendingChange }: {
  value: string; onChange: (value: string) => void; disabled: boolean; onPendingChange: (pending: boolean) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; onPendingChange(false); }, [onPendingChange]);
  const parsed = mapLinkSchema.safeParse(value);

  function locate() {
    if (!window.isSecureContext) { setError("Para usar o GPS, abra o link HTTPS do cardápio. Você também pode colar um link de mapas abaixo."); return; }
    if (!navigator.geolocation) { setError("Este navegador não oferece localização. Cole um link de mapas abaixo."); return; }
    const version = ++requestVersion.current;
    setLocating(true); onPendingChange(true); setError("");
    navigator.geolocation.getCurrentPosition((position) => {
      if (version !== requestVersion.current) return;
      setLocating(false); onPendingChange(false);
      try { onChange(coordinatesMapLink(position.coords.latitude, position.coords.longitude)); setAccuracy(Math.round(position.coords.accuracy)); }
      catch { setError("Não foi possível obter uma localização válida. Tente novamente ou cole um link de mapas."); }
    }, (failure) => {
      if (version !== requestVersion.current) return;
      setLocating(false); onPendingChange(false);
      setError(failure.code === 1 ? "A localização não foi autorizada. Permita o acesso no navegador ou cole um link de mapas." : failure.code === 3 ? "A localização demorou para responder. Tente novamente ou cole um link de mapas." : "Não foi possível obter a localização. Ative a localização do aparelho ou cole um link de mapas.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  return <section className="delivery-location-picker" aria-label="Localização para entrega">
    <h3>Localização para entrega</h3><p>Envie o ponto de entrega pelo GPS ou cole um link de mapas.</p>
    <button type="button" className="ghost-button" disabled={disabled || locating} onClick={locate}><MapPin size={20} aria-hidden="true" />{locating ? "Obtendo localização..." : "Usar minha localização atual"}</button>
    {locating && <button type="button" className="back-link" onClick={() => { requestVersion.current += 1; setLocating(false); onPendingChange(false); }}>Cancelar localização</button>}
    <label className="field-group">Link do Google Maps, Apple Mapas ou Waze (opcional)<input className="order-input" type="url" inputMode="url" maxLength={2048} placeholder="https://maps.app.goo.gl/..." disabled={disabled || locating} value={value} onChange={(event) => { onChange(event.target.value); setAccuracy(null); setError(""); }} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {value && !parsed.success && <p className="form-error" role="alert">Cole um link HTTPS válido do Google Maps, Apple Mapas ou Waze.</p>}
    {parsed.success && <div className="delivery-location-confirmation"><p role="status">Localização adicionada.{accuracy !== null ? ` Precisão aproximada: ${accuracy} m.` : ""} Confira o ponto antes de finalizar.</p><a className="back-link" href={parsed.data} target="_blank" rel="noopener noreferrer">Conferir no mapa ›</a><button type="button" className="back-link" disabled={disabled} onClick={() => { onChange(""); setAccuracy(null); }}>Remover localização</button></div>}
    <small>A localização é um ponto fixo, compartilhado somente ao finalizar o pedido. Com ela, o endereço escrito é opcional. Se quiser, acrescente número, complemento ou referência para ajudar na entrega.</small>
  </section>;
}
