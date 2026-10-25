"use client";

import { useTranslation } from "@/components/language-provider";


import Link from "next/link";
import { Bike, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderTypeBadge } from "@/components/order-type-badge";
import { uuid } from "@/lib/uuid";

import { CartEditor, ProductCatalog, cartSubtotal, money, type CartLine, type CatalogCategory, type CatalogProduct } from "./menu-cart";
import { deliveryAddressSchema, offsiteOrderSchema, phoneSchema } from "./offsite-validation";
import { customerApi } from "./public-client";
import { FloatingCart } from "./floating-cart";
import { DeliveryLocationPicker } from "./delivery-location-picker";
import { useDeliveryQuote } from "./use-delivery-quote";
import { DeliveryQuoteSummary } from "./delivery-quote-summary";

import { brl, brlCentsFor, paymentLabels, type PaymentConfig } from "@/lib/money";
type Menu = { payment_configuration: PaymentConfig; products: CatalogProduct[]; categories: CatalogCategory[]; settings: {
  is_accepting_orders: boolean; pickup_enabled: boolean; delivery_enabled: boolean; delivery_fee: number;
  min_delivery_order: number; estimated_pickup_minutes: number; estimated_delivery_minutes: number;
  delivery_fee_mode: string; delivery_distance_step_km: number; delivery_distance_step_fee: number;
} };
const blankAddress = { street: "", number: "", complement: "", neighborhood: "", city: "", state: "", zip_code: "", reference: "" };
const addressLabels: Record<keyof typeof blankAddress, string> = { street: "Rua (opcional com localização)", number: "Número (opcional)", complement: "Complemento (opcional)", neighborhood: "Bairro (opcional com localização)", city: "Cidade (opcional com localização)", state: "UF (opcional com localização)", zip_code: "CEP (opcional com localização)", reference: "Referência (opcional)" };

export function OffsiteMenu() {
  const t = useTranslation();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [type, setType] = useState<"pickup" | "delivery">("pickup");
  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(blankAddress);
  const [locationUrl, setLocationUrl] = useState("");
  const [locationPending, setLocationPending] = useState(false);
  const [remember, setRemember] = useState(false);
  const [payment, setPayment] = useState<"cash" | "transfer" | "card" | "pix">("pix");
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
    } catch (failure) { if (!signal?.aborted) setError(failure instanceof Error ? failure.message : t("Não foi possível carregar.")); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [t]);
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
      const result = deliveryAddressSchema.safeParse(JSON.parse(stored));
      if (result.success) { setAddress(result.data); setLocationUrl(result.data.location_url ?? ""); setNotice(t("Endereço salvo neste aparelho preenchido. Confira antes de enviar.")); }
    } catch { /* Local address reuse is optional. */ }
  }

  const subtotal = cartSubtotal(cart);
  const distanceMode = type === "delivery" && menu?.settings.delivery_fee_mode === "distance";
  const delivery = useDeliveryQuote(locationUrl.trim(), distanceMode && step === 3 && !created, `${menu?.settings.delivery_distance_step_km}:${menu?.settings.delivery_distance_step_fee}`);
  const fee = type === "delivery" ? distanceMode ? delivery.quote?.fee ?? 0 : menu?.settings.delivery_fee ?? 0 : 0;
  const quoteReady = !distanceMode || !!delivery.quote;
  const total = subtotal + fee;
  const belowMinimum = type === "delivery" && subtotal < (menu?.settings.min_delivery_order ?? 0);
  const accepting = !!menu?.settings.is_accepting_orders && (type === "pickup" ? menu.settings.pickup_enabled : menu.settings.delivery_enabled);

  async function submit() {
    if (lock.current || !quoteReady || locationPending || !accepting || !cart.length || belowMinimum) return;
    const payload = offsiteOrderSchema.safeParse({ order_type: type, customer_name: name, customer_phone: phone,
      ...(type === "delivery" ? { delivery_address: { ...address, location_url: locationUrl.trim() || undefined, delivery_quote_id: distanceMode ? delivery.quote?.id ?? undefined : undefined } } : {}), payment_method: payment,
      ...(payment === "cash" && needsChange ? { cash_change_for: Number(change.replace(",", ".")) } : {}), notes,
      items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity, notes: line.notes })),
    });
    if (!payload.success) { setError(t("Confira nome, telefone com DDD e pagamento. Para entrega, envie uma localização válida ou preencha o endereço completo.")); return; }
    if (payload.data.cash_change_for !== undefined && payload.data.cash_change_for < total) { setError(t("O valor para troco deve ser igual ou maior que o total.")); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await customerApi<{ order_number: number; tracking_path: string }>("/api/public/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.data) });
      if (remember && payload.data.order_type === "delivery") {
        try { localStorage.setItem(`delivery-address:${payload.data.customer_phone}`, JSON.stringify(payload.data.delivery_address)); } catch { /* Ordering does not depend on storage. */ }
      }
      setCreated({ ...result, minutes: type === "delivery" ? menu!.settings.estimated_delivery_minutes : menu!.settings.estimated_pickup_minutes });
      setCart([]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("Não foi possível confirmar o envio.")); }
    finally { setBusy(false); lock.current = false; }
  }

  if (created) return <main className="customer-page"><section className="order-panel"><h1>{t("Pedido #")}{created.order_number} {t(" recebido!")}</h1><p>{t("Aguardando confirmação do restaurante.")}</p><p>{t("Previsão aproximada: ")}{t(created.minutes)} {t(" minutos.")}</p><Link className="primary-button" href={created.tracking_path}>{t("Acompanhar pedido")}</Link><p>{t("Guarde o link de acompanhamento.")}</p></section></main>;

  return <main className={`customer-page ${step === 1 ? "fulfillment-page" : step === 2 ? "offsite-browsing" : ""}`}><header className="customer-header"><span className="eyebrow">Mesa Certa</span><h1>{t("Peça para levar")}</h1><p>{t("Retirada ou entrega, com pagamento ao receber.")}</p></header>
    {error && <p className="table-notice table-notice-error" role="alert">{t(error)}</p>}{notice && <p className="table-notice table-notice-info" role="status">{t(notice)}</p>}
    <button className="ghost-button" disabled={loading || busy} onClick={() => void load()}>{t(loading ? t("Carregando...") : t("Atualizar cardápio"))}</button>
    {menu && <>
      {!menu.settings.is_accepting_orders && <p className="table-notice table-notice-info">{t("Estamos fechados para novos pedidos.")}</p>}
      {!menu.settings.pickup_enabled && !menu.settings.delivery_enabled && <p>{t("Retirada e entrega estão indisponíveis.")}</p>}
      <nav className="order-steps" aria-label={t("Etapas do pedido")}>{[t("Tipo"), t("Cardápio"), t("Dados e pagamento")].map((label, index) => <span key={label} aria-current={step === index + 1 ? "step" : undefined}>{t(index + 1)}. {t(label)}</span>)}</nav>
      {step === 1 && <section className="order-panel fulfillment-panel"><h2>{t("Como deseja receber?")}</h2><p className="fulfillment-intro">{t("Escolha a melhor opção para você.")}</p><div className="fulfillment-options">{(["pickup", "delivery"] as const).filter((value) => menu.settings[`${value}_enabled`]).map((value) => {
        const Icon = value === "pickup" ? ShoppingBag : Bike;
        return <button type="button" className="fulfillment-option" disabled={!menu.settings.is_accepting_orders} key={value} aria-pressed={type === value} onClick={() => setType(value)}><Icon size={42} aria-hidden="true" /><strong>{t(value === "pickup" ? t("Retirada") : t("Entrega"))}</strong><span>{t(value === "pickup" ? t("Busque no restaurante") : t("Receba no seu endereço"))}</span><small>{t("Cerca de ")}{t(value === "pickup" ? menu.settings.estimated_pickup_minutes : menu.settings.estimated_delivery_minutes)} min</small></button>;
      })}</div><div className="fulfillment-summary" aria-live="polite">{type === "delivery" ? <><span>{t("Taxa de entrega")}<strong>{t(distanceMode ? t(`${money.format(menu.settings.delivery_distance_step_fee)} a cada ${menu.settings.delivery_distance_step_km} km`) : money.format(fee))}</strong></span><span>{t("Mínimo em produtos")}<strong>{t(money.format(menu.settings.min_delivery_order))}</strong></span></> : <p>{t("Seu pedido preparado para você buscar no restaurante.")}</p>}</div><button className="primary-button fulfillment-continue" disabled={!accepting || loading} onClick={() => setStep(2)}>{t("Ver cardápio")}</button></section>}
      {step === 2 && <div className="customer-menu-with-cart"><ProductCatalog pageSize={12} categoryPages products={menu.products} categories={menu.categories} disabled={busy || !accepting || loading} cartCount={cart.length} onAdd={(product) => setCart((current) => [...current, { id: uuid(), product, quantity: 1, notes: "" }])} /><button type="button" className="ghost-button" onClick={() => setStep(1)}>{t("Alterar retirada/entrega")}</button>
        <FloatingCart quantity={cart.reduce((sum, line) => sum + line.quantity, 0)} total={total} footer={<><p className="order-total">{t("Total estimado")}<strong>{t(money.format(total))}</strong></p><button type="button" className="primary-button" disabled={busy || loading || !cart.length || belowMinimum || !accepting} onClick={() => { setError(""); setStep(3); window.scrollTo({ top: 0, behavior: "instant" }); }}>{t("Continuar pedido")}</button></>}>
          <CartEditor cart={cart} setCart={setCart} busy={busy} /><p className="order-total">{t("Produtos")}<strong>{t(money.format(subtotal))}</strong></p>{type === "delivery" && <p>{t(distanceMode ? t("A entrega será calculada pela localização na próxima etapa.") : t(`Taxa de entrega: ${money.format(fee)}`))}</p>}{belowMinimum && <p role="status">{t("Mínimo em produtos: ")}{t(money.format(menu.settings.min_delivery_order))}.</p>}{!accepting && <p role="status">{t("Estamos fechados para este tipo de pedido.")}</p>}
        </FloatingCart>
      </div>}
      {step === 3 && <section className="order-panel checkout-form"><h2>{t("Dados para ")}{t(type === "delivery" ? "entrega" : "retirada")}</h2><OrderTypeBadge type={type} />
        <label className="field-group">{t("Nome")}<input className="order-input" autoComplete="name" maxLength={80} disabled={busy} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field-group">{t("Telefone com DDD")}<input className="order-input" type="tel" autoComplete="tel" maxLength={30} disabled={busy} value={phone} onChange={(event) => setPhone(event.target.value)} onBlur={savedAddress} /></label>
        {type === "delivery" && <fieldset className="address-fields"><legend>{t("Endereço de entrega")}</legend><DeliveryLocationPicker value={locationUrl} onChange={setLocationUrl} disabled={busy} onPendingChange={setLocationPending} />{distanceMode && <DeliveryQuoteSummary {...delivery} />}<details className="delivery-written-address"><summary>{t("Adicionar endereço escrito ou referência (opcional com localização)")}</summary>{(Object.keys(blankAddress) as (keyof typeof blankAddress)[]).map((key) => <label className="field-group" key={key}>{addressLabels[key]}<input className="order-input" disabled={busy} value={address[key]} maxLength={key === "state" ? 2 : key === "zip_code" ? 9 : key === "number" ? 20 : key === "reference" ? 200 : 120} onChange={(event) => setAddress((current) => ({ ...current, [key]: key === "state" ? event.target.value.toUpperCase() : event.target.value }))} /></label>)}</details><label><input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} /> {t(" Salvar endereço neste aparelho para este telefone")}</label><button className="ghost-button" disabled={busy} onClick={() => { const parsed = phoneSchema.safeParse(phone); if (parsed.success) { try { localStorage.removeItem(`delivery-address:${parsed.data}`); } catch { /* Storage is optional. */ } setRemember(false); setNotice(t("Endereço removido deste aparelho.")); } }}>{t("Esquecer endereço salvo")}</button></fieldset>}
        <label className="field-group">{t("Pagamento ao receber")}<select className="order-input" disabled={busy} value={payment} onChange={(event) => setPayment(event.target.value as typeof payment)}>{menu.payment_configuration.enabled_methods.map((method) => <option key={method} value={method} disabled={method === "pix" && !menu.payment_configuration.rate}>{t(paymentLabels[method])}</option>)}</select></label>
        {payment === "pix" && <p>{t("Valor aproximado em reais")}: {menu.payment_configuration.rate ? brl.format(brlCentsFor(total, menu.payment_configuration.rate.rate, menu.payment_configuration.rate.rounding)) : t("Cotação indisponível. Escolha outra forma.")}</p>}
        {payment === "cash" && <><label><input type="checkbox" disabled={busy} checked={needsChange} onChange={(event) => setNeedsChange(event.target.checked)} /> {t(" Preciso de troco")}</label>{needsChange && <label className="field-group">{t("Troco para quanto?")}<input className="order-input" type="number" min={total} step="1" disabled={busy} value={change} onChange={(event) => setChange(event.target.value)} /></label>}</>}
        <label className="field-group">{t("Observações (opcional)")}<textarea className="order-input" maxLength={500} disabled={busy} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <p>{t("Produtos ")}{t(money.format(subtotal))} {t(" · Entrega ")}{t(quoteReady ? money.format(fee) : "a calcular")}</p><p className="order-total">{t("Total estimado")}<strong>{t(money.format(total))}</strong></p><p>{t("Os valores e a disponibilidade serão conferidos ao enviar.")}</p>
        <div className="cashier-actions"><button className="ghost-button" disabled={busy} onClick={() => setStep(2)}>{t("Revisar itens")}</button><button className="primary-button" disabled={busy || !quoteReady || locationPending || loading || !accepting || !cart.length || belowMinimum || !menu.payment_configuration.enabled_methods.includes(payment) || (payment === "pix" && !menu.payment_configuration.rate)} onClick={() => void submit()}>{t(busy ? t("Enviando...") : t("Confirmar pedido"))}</button></div>
      </section>}
    </>}
  </main>;
}
