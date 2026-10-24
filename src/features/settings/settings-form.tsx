"use client";

import { useRef, useState } from "react";
import { Store, Truck, MapPin, MessageCircle } from "lucide-react";

import type { StoredRow } from "@/types/records";
import { createClient } from "@/utils/supabase/client";

import { settingsSchema } from "./settings-schema";
import { coordinatesMapLink } from "@/features/customer-ordering/delivery-location";
import { customerApi } from "@/features/customer-ordering/public-client";

const switches = { is_accepting_orders: "Aceitar novos pedidos", pickup_enabled: "Permitir retirada", delivery_enabled: "Permitir entrega", dine_in_qr_enabled: "Permitir QR/NFC nas mesas", require_confirmation_for_qr: "Exigir confirmação do primeiro pedido QR/NFC", whatsapp_enabled: "Habilitar pedidos pelo WhatsApp" };
const numbers = { min_delivery_order: "Pedido mínimo para entrega (R$)", estimated_pickup_minutes: "Previsão de retirada (minutos)", estimated_delivery_minutes: "Previsão de entrega (minutos)", delivery_fee: "Taxa fixa de entrega (R$)", delivery_distance_step_km: "Tamanho de cada faixa (km)", delivery_distance_step_fee: "Valor por faixa (R$)" };
const sections = [
  { id: "operations", label: "Atendimento", description: "Pedidos, retirada e mesas", icon: Store },
  { id: "delivery", label: "Entrega e taxas", description: "Valores, distância e prazo", icon: Truck },
  { id: "location", label: "Localização", description: "Ponto de saída do restaurante", icon: MapPin },
  { id: "whatsapp", label: "WhatsApp", description: "Atendimento pelo WhatsApp", icon: MessageCircle },
] as const;
type SettingsSection = typeof sections[number]["id"];

export function SettingsForm({ initial }: { initial: StoredRow<"restaurant_settings"> }) {
  const [db] = useState(createClient);
  const { id, ...initialFields } = initial;
  void id;
  const [form, setForm] = useState(initialFields);
  const [section, setSection] = useState<SettingsSection>("operations");
  const [savedFields, setSavedFields] = useState(JSON.stringify(initialFields));
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(form) !== savedFields;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [originLink, setOriginLink] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
  const lock = useRef(false);
  const latitude = form.delivery_origin_latitude, longitude = form.delivery_origin_longitude;
  const originMapUrl = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? coordinatesMapLink(latitude, longitude) : null;
  async function loadOriginLink() {
    if (busy) return;
    setBusy(true); setLocationNotice("");
    try {
      const point = await customerApi<{ latitude: number; longitude: number }>("/api/staff/restaurant-location", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ location_url: originLink.trim() }) });
      setForm((current) => ({ ...current, delivery_origin_latitude: Number(point.latitude.toFixed(6)), delivery_origin_longitude: Number(point.longitude.toFixed(6)) }));
      setLocationNotice("Localização carregada. Confira no mapa e clique em Salvar configurações para aplicar.");
    } catch (failure) { setLocationNotice(failure instanceof Error ? failure.message : "Não foi possível carregar o ponto do mapa."); }
    finally { setBusy(false); }
  }
  function locateRestaurant() {
    if (!window.isSecureContext || !navigator.geolocation) { setNotice("Abra por HTTPS ou localhost para usar o GPS, ou informe as coordenadas do restaurante."); return; }
    setBusy(true); setNotice("");
    navigator.geolocation.getCurrentPosition((position) => {
      setForm((current) => ({ ...current, delivery_origin_latitude: Number(position.coords.latitude.toFixed(6)), delivery_origin_longitude: Number(position.coords.longitude.toFixed(6)) }));
      setBusy(false); setNotice("Ponto de saída preenchido. Confira se você está no restaurante e salve as configurações.");
    }, () => { setBusy(false); setNotice("Não foi possível obter a localização. Informe as coordenadas ou um link com o ponto do restaurante."); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  async function save() {
    if (lock.current) return;
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) { setNotice("Confira os valores, tempos e coordenadas. A cobrança por distância exige uma localização válida do restaurante."); return; }
    lock.current = true; setBusy(true); setNotice("");
    try {
      const result = await db.from("restaurant_settings").update(parsed.data).eq("id", true).select("id");
      if (result.error || !result.data?.length) throw result.error ?? new Error("No settings updated");
      setNotice("Configurações salvas. Os novos pedidos usarão estes valores.");
      setLocationNotice("Localização salva nas configurações do restaurante.");
      setSavedFields(JSON.stringify(form));
    } catch { setNotice("Não foi possível salvar. Confira sua conexão e o acesso de administrador."); }
    finally { lock.current = false; setBusy(false); }
  }
  function renderSwitch(key: keyof typeof switches, description: string) {
    return <label className="settings-switch-row" key={key}><span><strong>{switches[key]}</strong><small>{description}</small></span><input type="checkbox" disabled={busy} checked={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} /></label>;
  }
  function renderNumber(key: keyof typeof numbers) {
    const minutes = key.startsWith("estimated");
    return <label className="field-group" key={key}>{numbers[key]}<input className="order-input" type="number" disabled={busy} value={Number.isNaN(form[key]) ? "" : form[key]} min={minutes ? 1 : key === "delivery_distance_step_km" ? 0.1 : 0} max={minutes ? 1440 : key === "delivery_distance_step_km" ? 100 : key === "delivery_distance_step_fee" ? 9999.99 : 999999.99} step={minutes ? 1 : 0.01} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value === "" ? NaN : Number(event.target.value) }))} /></label>;
  }
  function changeSection(next: SettingsSection) {
    setSection(next);
    panelHeading.current?.focus({ preventScroll: true });
  }
  const selected = sections.find((entry) => entry.id === section)!;
  return <section className="settings-workspace">
    <header className="settings-page-heading"><span className="eyebrow">Administração</span><h1>Configurações</h1><p>Organize o atendimento do restaurante, as entregas e os canais de pedido.</p></header>
    {notice && <p className="table-notice table-notice-info" role="status">{notice}</p>}
    <div className="settings-workspace-layout">
      <nav className="settings-section-nav" aria-label="Categorias das configurações">{sections.map(({ id, label, description, icon: Icon }) => <button key={id} id={`settings-nav-${id}`} type="button" aria-pressed={section === id} aria-controls="settings-content" onClick={() => changeSection(id)}><Icon size={21} aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span></button>)}</nav>
      <section id="settings-content" className="order-panel settings-section-card" aria-labelledby={`settings-nav-${section}`}>
        <header className="settings-section-heading"><h2 ref={panelHeading} tabIndex={-1}>{selected.label}</h2><p>{selected.description}</p></header>
        {section === "operations" && <>
          <fieldset className="settings-fieldset"><legend>Recebimento de pedidos</legend>{renderSwitch("is_accepting_orders", "Abra ou pause os novos pedidos em todos os canais.")}{renderSwitch("pickup_enabled", "Permita que o cliente peça e retire no restaurante.")}</fieldset>
          <fieldset className="settings-fieldset"><legend>Mesas e QR codes</legend>{renderSwitch("dine_in_qr_enabled", "Receba pedidos pelo QR code ou NFC da mesa.")}{renderSwitch("require_confirmation_for_qr", "A equipe confirma o primeiro pedido antes de iniciar o preparo.")}</fieldset>
          <fieldset className="settings-fieldset"><legend>Prazo de retirada</legend><div className="settings-fields-grid">{renderNumber("estimated_pickup_minutes")}</div></fieldset>
        </>}
        {section === "delivery" && <>
          <fieldset className="settings-fieldset"><legend>Disponibilidade e prazo</legend>{renderSwitch("delivery_enabled", "Permita pedidos para entrega no endereço do cliente.")}<div className="settings-fields-grid">{renderNumber("min_delivery_order")}{renderNumber("estimated_delivery_minutes")}</div></fieldset>
          <fieldset className="settings-fieldset"><legend>Taxa de entrega</legend><label className="field-group">Forma de cobrança<select className="order-input" disabled={busy} value={form.delivery_fee_mode} onChange={(event) => setForm((current) => ({ ...current, delivery_fee_mode: event.target.value }))}><option value="fixed">Taxa fixa</option><option value="distance">Por distância pelas ruas</option></select></label>
            <div className="settings-fields-grid">{form.delivery_fee_mode === "fixed" ? renderNumber("delivery_fee") : <>{renderNumber("delivery_distance_step_km")}{renderNumber("delivery_distance_step_fee")}</>}</div>
            {form.delivery_fee_mode === "distance" && <div className="settings-context-note"><p>Até {form.delivery_distance_step_km} km: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(form.delivery_distance_step_fee)}. Cada nova faixa acrescenta o mesmo valor.</p><p>O cálculo usa a rota pelas ruas a partir do restaurante.</p><button type="button" className="back-link" onClick={() => changeSection("location")}>Configurar ponto de saída ›</button></div>}
          </fieldset>
        </>}
        {section === "location" && <>
          <div className="settings-context-note"><p>Defina de onde saem as entregas. Esse ponto pode ser alterado mesmo com a taxa fixa selecionada.</p>{originMapUrl ? <a className="back-link" href={originMapUrl} target="_blank" rel="noopener noreferrer">Conferir localização no mapa ›</a> : <p>Nenhuma localização válida configurada.</p>}</div>
          <fieldset className="settings-fieldset"><legend>Usar um link de mapa</legend><label className="field-group">Google Maps, Apple Mapas ou Waze<input className="order-input" type="url" maxLength={2048} placeholder="https://maps.app.goo.gl/..." value={originLink} disabled={busy} onChange={(event) => setOriginLink(event.target.value)} /></label><button type="button" className="ghost-button" disabled={busy || !originLink.trim()} onClick={() => void loadOriginLink()}>Carregar localização do link</button></fieldset>
          <fieldset className="settings-fieldset"><legend>Usar o GPS</legend><p>Use esta opção estando no restaurante.</p><button type="button" className="ghost-button" disabled={busy} onClick={locateRestaurant}>Usar localização atual do restaurante</button></fieldset>
          {locationNotice && <p className="table-notice table-notice-info" role="status">{locationNotice}</p>}
          <details className="settings-coordinate-details"><summary>Ajustar coordenadas manualmente</summary><div className="settings-fields-grid">{(["delivery_origin_latitude", "delivery_origin_longitude"] as const).map((key) => <label className="field-group" key={key}>{key.endsWith("latitude") ? "Latitude" : "Longitude"}<input className="order-input" type="number" step="0.000001" min={key.endsWith("latitude") ? -90 : -180} max={key.endsWith("latitude") ? 90 : 180} disabled={busy} value={form[key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value === "" ? null : Number(event.target.value) }))} /></label>)}</div></details>
        </>}
        {section === "whatsapp" && <fieldset className="settings-fieldset"><legend>Pedidos pelo WhatsApp</legend>{renderSwitch("whatsapp_enabled", "Envie o link do cardápio para o cliente montar o pedido.")}<div className="settings-context-note"><p>Os pedidos recebidos pelo link aparecem na Central de pedidos.</p><p>Para pausar todos os canais, use a opção Aceitar novos pedidos em Atendimento.</p></div></fieldset>}
      </section>
    </div>
    <footer className="settings-save-bar"><div><strong>{dirty ? "Alterações não salvas" : "Configurações atualizadas"}</strong><small>Você pode trocar de seção antes de salvar. As alterações valem para novos pedidos.</small></div><button type="button" className="primary-button" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Aguarde..." : "Salvar alterações"}</button></footer>
  </section>;
}
