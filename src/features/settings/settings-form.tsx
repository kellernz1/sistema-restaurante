"use client";
import { money, MAX_MONEY } from "@/lib/money";


import { useTranslation } from "@/components/language-provider";


import { useEffect, useRef, useState } from "react";
import { Store, Truck, MapPin, MessageCircle, Printer } from "lucide-react";

import type { StoredRow } from "@/types/records";
import { createClient } from "@/utils/supabase/client";

import { PrintingSettings } from "@/features/printing/printing-settings";
import { OperationsPanel } from "@/features/operations/operations-panel";
import { CashPolicySettings } from "@/features/cash-sessions/policy-settings";
import {ServiceSettings} from "@/features/service-modes/service-settings";
import { PaymentSettings } from "@/features/payments/payment-settings";
import { settingsSchema } from "./settings-schema";
import { coordinatesMapLink } from "@/features/customer-ordering/delivery-location";
import { customerApi } from "@/features/customer-ordering/public-client";

const switches = { kitchen_auto_print_enabled: "Impressão automática na cozinha", is_accepting_orders: "Aceitar novos pedidos", pickup_enabled: "Permitir retirada", delivery_enabled: "Permitir entrega", dine_in_qr_enabled: "Permitir QR/NFC nas mesas", require_confirmation_for_qr: "Exigir confirmação do primeiro pedido QR/NFC", whatsapp_enabled: "Habilitar pedidos pelo WhatsApp" };
const numbers = { min_delivery_order: "Pedido mínimo para entrega (PYG)", estimated_pickup_minutes: "Previsão de retirada (minutos)", estimated_delivery_minutes: "Previsão de entrega (minutos)", delivery_fee: "Taxa fixa de entrega (PYG)", delivery_distance_step_km: "Tamanho de cada faixa (km)", delivery_distance_step_fee: "Valor por faixa (PYG)" };
const sections = [
  { id: "backup", label: "Backup e serviços locais", description: "Proteção dos dados e recuperação", icon: Store },
  { id: "payments", label: "Pagamentos e câmbio", description: "Formas e cotação do real", icon: Store },
  { id: "counter", label: "Balcão e dia comercial", description: "Senhas, pagamento e espera", icon: Store },
  { id: "operations", label: "Atendimento", description: "Pedidos, retirada e mesas", icon: Store },
  { id: "delivery", label: "Entrega e taxas", description: "Valores, distância e prazo", icon: Truck },
  { id: "location", label: "Localização", description: "Ponto de saída do restaurante", icon: MapPin },
  { id: "printing", label: "Impressão", description: "Comandas e impressão automática", icon: Printer },
  { id: "whatsapp", label: "WhatsApp", description: "Atendimento pelo WhatsApp", icon: MessageCircle },
] as const;
type SettingsSection = typeof sections[number]["id"];

export function SettingsForm({ initial }: { initial: StoredRow<"restaurant_settings"> }) {
  const t = useTranslation();
  const [db] = useState(createClient);
  const { id, enabled_payment_methods, ...initialFields } = initial;
  void enabled_payment_methods;
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
      setLocationNotice(t("Localização carregada. Confira no mapa e clique em Salvar configurações para aplicar."));
    } catch (failure) { setLocationNotice(failure instanceof Error ? failure.message : t("Não foi possível carregar o ponto do mapa.")); }
    finally { setBusy(false); }
  }
  function locateRestaurant() {
    if (!window.isSecureContext || !navigator.geolocation) { setNotice(t("Abra por HTTPS ou localhost para usar o GPS, ou informe as coordenadas do restaurante.")); return; }
    setBusy(true); setNotice("");
    navigator.geolocation.getCurrentPosition((position) => {
      setForm((current) => ({ ...current, delivery_origin_latitude: Number(position.coords.latitude.toFixed(6)), delivery_origin_longitude: Number(position.coords.longitude.toFixed(6)) }));
      setBusy(false); setNotice(t("Ponto de saída preenchido. Confira se você está no restaurante e salve as configurações."));
    }, () => { setBusy(false); setNotice(t("Não foi possível obter a localização. Informe as coordenadas ou um link com o ponto do restaurante.")); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  async function save() {
    if (lock.current) return;
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) { setNotice(t("Confira os valores, tempos e coordenadas. A cobrança por distância exige uma localização válida do restaurante.")); return; }
    lock.current = true; setBusy(true); setNotice("");
    try {
      const result = await db.from("restaurant_settings").update(parsed.data).eq("id", true).select("id");
      if (result.error || !result.data?.length) throw result.error ?? new Error("No settings updated");
      setNotice(t("Configurações salvas. Os novos pedidos usarão estes valores."));
      setLocationNotice(t("Localização salva nas configurações do restaurante."));
      setSavedFields(JSON.stringify(form));
    } catch { setNotice(t("Não foi possível salvar. Confira sua conexão e o acesso de administrador.")); }
    finally { lock.current = false; setBusy(false); }
  }
  function renderSwitch(key: keyof typeof switches, description: string) {
    return <label className="settings-switch-row" key={key}><span><strong>{t(switches[key])}</strong><small>{t(description)}</small></span><input type="checkbox" disabled={busy} checked={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} /></label>;
  }
  function renderNumber(key: keyof typeof numbers) {
    const minutes = key.startsWith("estimated");
    return <label className="field-group" key={key}>{t(numbers[key])}<input className="order-input" type="number" disabled={busy} value={Number.isNaN(form[key]) ? "" : t(form[key])} min={minutes ? 1 : key === "delivery_distance_step_km" ? 0.1 : 0} max={minutes ? 1440 : key === "delivery_distance_step_km" ? 100 : key === "delivery_distance_step_fee" ? MAX_MONEY : MAX_MONEY} step={key === "delivery_distance_step_km" ? 0.01 : 1} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value === "" ? NaN : Number(event.target.value) }))} /></label>;
  }
  function changeSection(next: SettingsSection) {
    setSection(next);
    window.history.replaceState(window.history.state, "", `#settings-${next}`);
    window.dispatchEvent(new Event("staff-navigation"));
    panelHeading.current?.focus({ preventScroll: true });
  }
  const selected = sections.find((entry) => entry.id === section)!;
  useEffect(() => {
    const read = () => { const id = window.location.hash.replace("#settings-", ""); if (sections.some(entry => entry.id === id)) setSection(id as SettingsSection); };
    const timer = setTimeout(read, 0); window.addEventListener("hashchange", read); window.addEventListener("popstate", read); window.addEventListener("staff-navigation", read);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", read); window.removeEventListener("popstate", read); window.removeEventListener("staff-navigation", read); };
  }, []);
  return <section className="settings-workspace">
    <header className="settings-page-heading"><span className="eyebrow">{t("Administração")}</span><h1>{t("Configurações")}</h1><p>{t("Organize o atendimento do restaurante, as entregas e os canais de pedido.")}</p></header>
    {notice && <p className="table-notice table-notice-info" role="status">{t(notice)}</p>}
    <div className="settings-workspace-layout">
      <nav className="settings-section-nav" aria-label={t("Categorias das configurações")}>{sections.map(({ id, label, description, icon: Icon }) => <button key={id} id={`settings-nav-${id}`} type="button" aria-pressed={section === id} aria-controls="settings-content" onClick={() => changeSection(id)}><Icon size={21} aria-hidden="true" /><span><strong>{t(label)}</strong><small>{t(description)}</small></span></button>)}</nav>
      <section id="settings-content" className="order-panel settings-section-card" aria-labelledby={`settings-nav-${section}`}>
        <header className="settings-section-heading"><h2 ref={panelHeading} tabIndex={-1}>{t(selected.label)}</h2><p>{t(selected.description)}</p></header>
        {section === "payments" && <><PaymentSettings /><CashPolicySettings /></>}
        {section === "backup" && <OperationsPanel editable/>}
        {section === "counter" && <>
          <label className="field-group">{t("Nome do restaurante")}<input className="order-input" maxLength={80} value={form.restaurant_name} disabled={busy} onChange={(event)=>setForm({...form,restaurant_name:event.target.value})} /></label>
          <label className="field-group">{t("Fuso do dia comercial")}<input className="order-input" value={form.business_timezone} disabled={busy} onChange={(event)=>setForm({...form,business_timezone:event.target.value})} /></label>
          <label className="field-group">{t("Início do dia comercial")}<input className="order-input" type="time" step="60" value={form.business_day_start.slice(0,5)} disabled={busy} onChange={(event)=>setForm({...form,business_day_start:event.target.value})} /></label>
          <label className="field-group">{t("Pagamento no balcão")}<select className="order-input" value={form.counter_payment_timing} disabled={busy} onChange={(event)=>setForm({...form,counter_payment_timing:event.target.value})}><option value="at_order">{t("Pagar ao pedir")}</option><option value="at_end">{t("Pagar no final")}</option></select></label>
          {(["counter_green_minutes","counter_yellow_minutes"] as const).map((key)=><label className="field-group" key={key}>{t(key==="counter_green_minutes"?"Verde até (minutos)":"Amarelo até (minutos)")}<input className="order-input" type="number" min="0" step="1" value={form[key]} disabled={busy} onChange={(event)=>setForm({...form,[key]:Number(event.target.value)})} /></label>)}
        </>}
        {section === "operations" && <>
          <ServiceSettings/>
          <fieldset className="settings-fieldset"><legend>{t("País padrão dos telefones")}</legend><select className="order-input" disabled={busy} value={form.default_phone_country} onChange={(event) => setForm((current) => ({...current,default_phone_country:event.target.value}))}><option value="PY">{t("Paraguai (+595)")}</option><option value="BR">{t("Brasil (+55)")}</option></select></fieldset><fieldset className="settings-fieldset"><legend>{t("Recebimento de pedidos")}</legend>{t(renderSwitch("is_accepting_orders", t("Abra ou pause os novos pedidos em todos os canais.")))}{t(renderSwitch("pickup_enabled", t("Permita que o cliente peça e retire no restaurante.")))}</fieldset>
          <fieldset className="settings-fieldset"><legend>{t("Mesas e QR codes")}</legend>{t(renderSwitch("dine_in_qr_enabled", t("Receba pedidos pelo QR code ou NFC da mesa.")))}</fieldset>
          <fieldset className="settings-fieldset"><legend>{t("Prazo de retirada")}</legend><div className="settings-fields-grid">{t(renderNumber("estimated_pickup_minutes"))}</div></fieldset>
        </>}
        {section === "delivery" && <>
          <fieldset className="settings-fieldset"><legend>{t("Disponibilidade e prazo")}</legend>{t(renderSwitch("delivery_enabled", t("Permita pedidos para entrega no endereço do cliente.")))}<div className="settings-fields-grid">{t(renderNumber("min_delivery_order"))}{t(renderNumber("estimated_delivery_minutes"))}</div></fieldset>
          <fieldset className="settings-fieldset"><legend>{t("Taxa de entrega")}</legend><label className="field-group">{t("Forma de cobrança")}<select className="order-input" disabled={busy} value={form.delivery_fee_mode} onChange={(event) => setForm((current) => ({ ...current, delivery_fee_mode: event.target.value }))}><option value="fixed">{t("Taxa fixa")}</option><option value="distance">{t("Por distância pelas ruas")}</option></select></label>
            <div className="settings-fields-grid">{form.delivery_fee_mode === "fixed" ? renderNumber("delivery_fee") : <>{t(renderNumber("delivery_distance_step_km"))}{t(renderNumber("delivery_distance_step_fee"))}</>}</div>
            {form.delivery_fee_mode === "distance" && <div className="settings-context-note"><p>{t("Até ")}{t(form.delivery_distance_step_km)} km: {t(money.format(form.delivery_distance_step_fee))}{t(". Cada nova faixa acrescenta o mesmo valor.")}</p><p>{t("O cálculo usa a rota pelas ruas a partir do restaurante.")}</p><button type="button" className="back-link" onClick={() => changeSection("location")}>{t("Configurar ponto de saída ›")}</button></div>}
          </fieldset>
        </>}
        {section === "location" && <>
          <div className="settings-context-note"><p>{t("Defina de onde saem as entregas. Esse ponto pode ser alterado mesmo com a taxa fixa selecionada.")}</p>{originMapUrl ? <a className="back-link" href={originMapUrl} target="_blank" rel="noopener noreferrer">{t("Conferir localização no mapa ›")}</a> : <p>{t("Nenhuma localização válida configurada.")}</p>}</div>
          <fieldset className="settings-fieldset"><legend>{t("Usar um link de mapa")}</legend><label className="field-group">{t("Google Maps, Apple Mapas ou Waze")}<input className="order-input" type="url" maxLength={2048} placeholder="https://maps.app.goo.gl/..." value={originLink} disabled={busy} onChange={(event) => setOriginLink(event.target.value)} /></label><button type="button" className="ghost-button" disabled={busy || !originLink.trim()} onClick={() => void loadOriginLink()}>{t("Carregar localização do link")}</button></fieldset>
          <fieldset className="settings-fieldset"><legend>{t("Usar o GPS")}</legend><p>{t("Use esta opção estando no restaurante.")}</p><button type="button" className="ghost-button" disabled={busy} onClick={locateRestaurant}>{t("Usar localização atual do restaurante")}</button></fieldset>
          {locationNotice && <p className="table-notice table-notice-info" role="status">{t(locationNotice)}</p>}
          <details className="settings-coordinate-details"><summary>{t("Ajustar coordenadas manualmente")}</summary><div className="settings-fields-grid">{(["delivery_origin_latitude", "delivery_origin_longitude"] as const).map((key) => <label className="field-group" key={key}>{t(key.endsWith("latitude") ? t("Latitude") : t("Longitude"))}<input className="order-input" type="number" step="0.000001" min={key.endsWith("latitude") ? -90 : -180} max={key.endsWith("latitude") ? 90 : 180} disabled={busy} value={form[key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value === "" ? null : Number(event.target.value) }))} /></label>)}</div></details>
        </>}
        {section === "printing" && <><PrintingSettings /><fieldset className="settings-fieldset">{renderSwitch("kitchen_auto_print_enabled", "Processe automaticamente as comandas confirmadas.")}</fieldset></>}
        {section === "whatsapp" && <fieldset className="settings-fieldset"><legend>{t("Pedidos pelo WhatsApp")}</legend>{t(renderSwitch("whatsapp_enabled", t("Envie o link do cardápio para o cliente montar o pedido.")))}<div className="settings-context-note"><p>{t("Os pedidos recebidos pelo link aparecem na Central de pedidos.")}</p><p>{t("Para pausar todos os canais, use a opção Aceitar novos pedidos em Atendimento.")}</p></div></fieldset>}
      </section>
    </div>
    {section!=="backup"&&<footer className="settings-save-bar"><div><strong>{t(dirty ? t("Alterações não salvas") : t("Configurações atualizadas"))}</strong><small>{t("Você pode trocar de seção antes de salvar. As alterações valem para novos pedidos.")}</small></div><button type="button" className="primary-button" disabled={busy || !dirty} onClick={() => void save()}>{t(busy ? t("Aguarde...") : t("Salvar alterações"))}</button></footer>}
  </section>;
}
