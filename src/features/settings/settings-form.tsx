"use client";

import { useRef, useState } from "react";

import type { Tables } from "@/types/database.types";
import { createClient } from "@/utils/supabase/client";

import { settingsSchema } from "./settings-schema";

const switches = { is_accepting_orders: "Aceitar novos pedidos", pickup_enabled: "Permitir retirada", delivery_enabled: "Permitir entrega", dine_in_qr_enabled: "Permitir QR/NFC nas mesas", require_confirmation_for_qr: "Exigir confirmação do primeiro pedido QR/NFC", whatsapp_enabled: "Habilitar pedidos pelo WhatsApp" };
const numbers = { delivery_fee: "Taxa de entrega (R$)", min_delivery_order: "Mínimo em produtos para entrega (R$)", estimated_pickup_minutes: "Previsão de retirada (minutos)", estimated_delivery_minutes: "Previsão de entrega (minutos)" };

export function SettingsForm({ initial }: { initial: Tables<"restaurant_settings"> }) {
  const [db] = useState(createClient);
  const { id, ...initialFields } = initial;
  void id;
  const [form, setForm] = useState(initialFields);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) { setNotice("Confira valores, centavos e tempos de 1 a 1.440 minutos."); return; }
    lock.current = true; setBusy(true); setNotice("");
    try {
      const result = await db.from("restaurant_settings").update(parsed.data).eq("id", true).select("id");
      if (result.error || !result.data?.length) throw result.error ?? new Error("No settings updated");
      setNotice("Configurações salvas. Os novos pedidos usarão estes valores.");
    } catch { setNotice("Não foi possível salvar. Confira sua conexão e o acesso de administrador."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="table-detail-state"><span className="eyebrow">Administração</span><h1>Configurações</h1>{notice && <p className="table-notice table-notice-info" role="status">{notice}</p>}<div className="order-panel checkout-form">{(Object.keys(switches) as (keyof typeof switches)[]).map((key) => <label key={key}><input type="checkbox" disabled={busy} checked={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} /> {switches[key]}</label>)}{(Object.keys(numbers) as (keyof typeof numbers)[]).map((key) => <label className="field-group" key={key}>{numbers[key]}<input className="order-input" type="number" disabled={busy} value={Number.isNaN(form[key]) ? "" : form[key]} min={key.startsWith("estimated") ? 1 : 0} step={key.startsWith("estimated") ? 1 : 0.01} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value === "" ? NaN : Number(event.target.value) }))} /></label>)}<button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar configurações"}</button></div></section>;
}
