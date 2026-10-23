"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";

import { CartEditor, ProductCatalog, cartSubtotal, money, type CartLine, type CatalogCategory, type CatalogProduct } from "./menu-cart";
import { addressSchema, offsiteOrderSchema, phoneSchema } from "./offsite-validation";
import { customerApi } from "./public-client";

type Menu = { products: CatalogProduct[]; categories: CatalogCategory[]; settings: {
  is_accepting_orders: boolean; pickup_enabled: boolean; delivery_enabled: boolean; delivery_fee: number;
  min_delivery_order: number; estimated_pickup_minutes: number; estimated_delivery_minutes: number;
} };
const blankAddress = { street: "", number: "", complement: "", neighborhood: "", city: "", state: "SP", zip_code: "", reference: "" };
const addressLabels: Record<keyof typeof blankAddress, string> = { street: "Rua", number: "Número", complement: "Complemento (opcional)", neighborhood: "Bairro", city: "Cidade", state: "UF", zip_code: "CEP", reference: "Referência (opcional)" };

export function OffsiteMenu() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [type, setType] = useState<"pickup" | "delivery">("pickup");
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(blankAddress);
  const [remember, setRemember] = useState(false);
  const [payment, setPayment] = useState<"cash" | "card" | "pix">("pix");
  const [needsChange, setNeedsChange] = useState(false);
  const [change, setChange] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ order_number: number; tracking_path: string; minutes: number } | null>(null);
  const lock = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await customerApi<Menu>("/api/public/menu", { signal });
      if (signal?.aborted) return;
      setMenu(data); setError("");
      setType((current) => current === "pickup" && !data.settings.pickup_enabled ? "delivery" : current === "delivery" && !data.settings.delivery_enabled ? "pickup" : current);
    } catch (failure) { if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível carregar."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);

  function savedAddress() {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return;
    try {
      const stored = localStorage.getItem(`delivery-address:${parsed.data}`);
      if (!stored) return;
      const result = addressSchema.safeParse(JSON.parse(stored));
      if (result.success) { setAddress(result.data); setNotice("Endereço salvo neste aparelho preenchido. Confira antes de enviar."); }
    } catch { /* Local address reuse is optional. */ }
  }

  const subtotal = cartSubtotal(cart);
  const fee = type === "delivery" ? menu?.settings.delivery_fee ?? 0 : 0;
  const total = (Math.round(subtotal * 100) + Math.round(fee * 100)) / 100;
  const belowMinimum = type === "delivery" && subtotal < (menu?.settings.min_delivery_order ?? 0);
  const accepting = !!menu?.settings.is_accepting_orders && (type === "pickup" ? menu.settings.pickup_enabled : menu.settings.delivery_enabled);

  async function submit() {
    if (lock.current || !accepting || !cart.length || belowMinimum) return;
    const payload = offsiteOrderSchema.safeParse({ order_type: type, customer_name: name, customer_phone: phone,
      ...(type === "delivery" ? { delivery_address: address } : {}), payment_method: payment,
      ...(payment === "cash" && needsChange ? { cash_change_for: Number(change.replace(",", ".")) } : {}), notes,
      items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity, notes: line.notes })),
    });
    if (!payload.success) { setError("Confira nome, telefone, endereço e pagamento. Informe o telefone com DDD e o CEP completo."); return; }
    if (payload.data.cash_change_for !== undefined && payload.data.cash_change_for < total) { setError("O valor para troco deve ser igual ou maior que o total."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await customerApi<{ order_number: number; tracking_path: string }>("/api/public/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.data) });
      if (remember && payload.data.order_type === "delivery") {
        try { localStorage.setItem(`delivery-address:${payload.data.customer_phone}`, JSON.stringify(payload.data.delivery_address)); } catch { /* Ordering does not depend on storage. */ }
      }
      setCreated({ ...result, minutes: type === "delivery" ? menu!.settings.estimated_delivery_minutes : menu!.settings.estimated_pickup_minutes });
      setCart([]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível confirmar o envio."); }
    finally { setBusy(false); lock.current = false; }
  }

  if (created) return <main className="customer-page"><section className="order-panel"><h1>Pedido #{created.order_number} recebido!</h1><p>Aguardando confirmação do restaurante.</p><p>Previsão aproximada: {created.minutes} minutos.</p><Link className="primary-button" href={created.tracking_path}>Acompanhar pedido</Link><p>Guarde o link de acompanhamento.</p></section></main>;

  return <main className="customer-page"><header className="customer-header"><span className="eyebrow">Mesa Certa</span><h1>Peça para levar</h1><p>Retirada ou entrega, com pagamento ao receber.</p></header>
    {error && <p className="table-notice table-notice-error" role="alert">{error}</p>}{notice && <p className="table-notice table-notice-info" role="status">{notice}</p>}
    <button className="ghost-button" disabled={loading || busy} onClick={() => void load()}>{loading ? "Carregando..." : "Atualizar cardápio"}</button>
    {menu && <>
      {!menu.settings.is_accepting_orders && <p className="table-notice table-notice-info">Estamos fechados para novos pedidos.</p>}
      {!menu.settings.pickup_enabled && !menu.settings.delivery_enabled && <p>Retirada e entrega estão indisponíveis.</p>}
      <nav className="order-steps" aria-label="Etapas do pedido">{["Tipo", "Cardápio", "Dados e pagamento"].map((label, index) => <span key={label} aria-current={step === index + 1 ? "step" : undefined}>{index + 1}. {label}</span>)}</nav>
      {step === 1 && <section className="order-panel"><h2>Como deseja receber?</h2><div className="cashier-actions">{(["pickup", "delivery"] as const).filter((value) => menu.settings[`${value}_enabled`]).map((value) => <button className="ghost-button" disabled={!menu.settings.is_accepting_orders} key={value} aria-pressed={type === value} onClick={() => setType(value)}><OrderTypeBadge type={value} /></button>)}</div><p>{type === "delivery" ? `Taxa ${money.format(fee)} · Mínimo em produtos ${money.format(menu.settings.min_delivery_order)} · Cerca de ${menu.settings.estimated_delivery_minutes} minutos` : `Cerca de ${menu.settings.estimated_pickup_minutes} minutos`}</p><button className="primary-button" disabled={!accepting || loading} onClick={() => setStep(2)}>Ver cardápio</button></section>}
      {step === 2 && <div className="order-layout"><ProductCatalog products={menu.products} categories={menu.categories} disabled={busy || !accepting || loading} cartCount={cart.length} onAdd={(product) => setCart((current) => [...current, { id: crypto.randomUUID(), product, quantity: 1, notes: "" }])} /><section className="order-panel"><h2>Seu pedido</h2><CartEditor cart={cart} setCart={setCart} busy={busy} /><p className="order-total">Produtos<strong>{money.format(subtotal)}</strong></p>{type === "delivery" && <p>Taxa de entrega: {money.format(fee)}</p>}<p>Total estimado: {money.format(total)}</p>{belowMinimum && <p role="status">Mínimo em produtos: {money.format(menu.settings.min_delivery_order)}.</p>}<div className="cashier-actions"><button className="ghost-button" onClick={() => setStep(1)}>Voltar</button><button className="primary-button" disabled={!cart.length || belowMinimum || !accepting} onClick={() => { setError(""); setStep(3); }}>Continuar</button></div></section></div>}
      {step === 3 && <section className="order-panel checkout-form"><h2>Dados para {type === "delivery" ? "entrega" : "retirada"}</h2><OrderTypeBadge type={type} />
        <label className="field-group">Nome<input className="order-input" autoComplete="name" maxLength={80} disabled={busy} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field-group">Telefone com DDD<input className="order-input" type="tel" autoComplete="tel" maxLength={30} disabled={busy} value={phone} onChange={(event) => setPhone(event.target.value)} onBlur={savedAddress} /></label>
        {type === "delivery" && <fieldset className="address-fields"><legend>Endereço de entrega</legend>{(Object.keys(blankAddress) as (keyof typeof blankAddress)[]).map((key) => <label className="field-group" key={key}>{addressLabels[key]}<input className="order-input" disabled={busy} value={address[key]} maxLength={key === "state" ? 2 : key === "zip_code" ? 9 : key === "number" ? 20 : key === "reference" ? 200 : 120} onChange={(event) => setAddress((current) => ({ ...current, [key]: key === "state" ? event.target.value.toUpperCase() : event.target.value }))} /></label>)}<label><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} /> Salvar endereço neste aparelho para este telefone</label><button className="ghost-button" disabled={busy} onClick={() => { const parsed = phoneSchema.safeParse(phone); if (parsed.success) { try { localStorage.removeItem(`delivery-address:${parsed.data}`); } catch { /* Storage is optional. */ } setRemember(false); setNotice("Endereço removido deste aparelho."); } }}>Esquecer endereço salvo</button></fieldset>}
        <label className="field-group">Pagamento ao receber<select className="order-input" disabled={busy} value={payment} onChange={(event) => setPayment(event.target.value as typeof payment)}><option value="pix">Pix na entrega/retirada</option><option value="card">Cartão</option><option value="cash">Dinheiro</option></select></label>
        {payment === "cash" && <><label><input type="checkbox" disabled={busy} checked={needsChange} onChange={(event) => setNeedsChange(event.target.checked)} /> Preciso de troco</label>{needsChange && <label className="field-group">Troco para quanto?<input className="order-input" type="number" min={total} step="0.01" disabled={busy} value={change} onChange={(event) => setChange(event.target.value)} /></label>}</>}
        <label className="field-group">Observações (opcional)<textarea className="order-input" maxLength={500} disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <p>Produtos {money.format(subtotal)} · Entrega {money.format(fee)}</p><p className="order-total">Total estimado<strong>{money.format(total)}</strong></p><p>Os valores e a disponibilidade serão conferidos ao enviar.</p>
        <div className="cashier-actions"><button className="ghost-button" disabled={busy} onClick={() => setStep(2)}>Revisar itens</button><button className="primary-button" disabled={busy || loading || !accepting || !cart.length || belowMinimum} onClick={() => void submit()}>{busy ? "Enviando..." : "Confirmar pedido"}</button></div>
      </section>}
    </>}
  </main>;
}
