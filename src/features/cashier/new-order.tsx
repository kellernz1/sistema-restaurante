"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { z } from "zod";

import { ArrowButton, ArrowLink, PillButton } from "@/components/ui";
import { CartEditor, ProductCatalog, cartSubtotal, money, type CartLine, type CatalogProduct, type CatalogCategory } from "@/features/customer-ordering/menu-cart";
import { CustomerApiError, customerApi } from "@/features/customer-ordering/public-client";
import { TABLE_STATUS_LABELS } from "@/features/tables/table-status";
import { uuid } from "@/lib/uuid";
import type { Tables } from "@/types/database.types";
import type { StoredRow } from "@/types/records";

import { cashierOrderSchema } from "@/features/cashier/order-validation";
import { useDeliveryQuote } from "@/features/customer-ordering/use-delivery-quote";
import { DeliveryQuoteSummary } from "@/features/customer-ordering/delivery-quote-summary";

const emptyAddress = { street: "", number: "", complement: "", neighborhood: "", city: "", state: "SP", zip_code: "", reference: "" };
const addressLabels: Record<keyof typeof emptyAddress, string> = {
  street: "Rua", number: "Número", complement: "Complemento (opcional)", neighborhood: "Bairro", city: "Cidade", state: "UF", zip_code: "CEP", reference: "Referência (opcional)",
};
type Submission = z.infer<typeof cashierOrderSchema>;
type Created = { order_id: string; order_number: number; total_amount: number };

export function CashierNewOrder({ tables, products, categories, settings }: {
  tables: Pick<Tables<"tables">, "id" | "table_number" | "status">[];
  products: CatalogProduct[]; categories: CatalogCategory[]; settings: StoredRow<"restaurant_settings">;
}) {
  const router = useRouter();
  const [type, setType] = useState<"dine_in" | "pickup" | "delivery">("dine_in");
  const [tableId, setTableId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [locationUrl, setLocationUrl] = useState("");
  const [payment, setPayment] = useState("pix");
  const [change, setChange] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<Submission | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const lock = useRef(false);
  const disabled = busy || !!attempt;
  const subtotal = cartSubtotal(cart);
  const distanceMode = type === "delivery" && settings.delivery_fee_mode === "distance";
  const delivery = useDeliveryQuote(locationUrl.trim(), distanceMode && !attempt && !created, `${settings.delivery_distance_step_km}:${settings.delivery_distance_step_fee}`);
  const fee = type === "delivery" ? distanceMode ? delivery.quote?.fee ?? 0 : settings.delivery_fee : 0;
  const quoteReady = !distanceMode || !!delivery.quote;
  const belowMinimum = type === "delivery" && subtotal < settings.min_delivery_order;
  const accepting = settings.is_accepting_orders && (type === "dine_in" || (type === "pickup" ? settings.pickup_enabled : settings.delivery_enabled));

  async function submit() {
    if (lock.current || (!attempt && !quoteReady)) return;
    const parsed = cashierOrderSchema.safeParse(attempt ?? {
      request_id: uuid(), payload: {
        order_type: type, notes,
        items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity, notes: line.notes })),
        ...(type === "dine_in" ? { table_id: tableId } : {
          customer_name: name, customer_phone: phone, payment_method: payment,
          ...(type === "delivery" ? { delivery_address: { ...address, location_url: locationUrl.trim() || undefined, delivery_quote_id: distanceMode ? delivery.quote?.id ?? undefined : undefined } } : {}),
          ...(payment === "cash" && change !== "" ? { cash_change_for: Number(change) } : {}),
        }),
      },
    });
    if (!parsed.success) { setError("Confira a mesa, os itens e as quantidades. Para retirada ou entrega, informe nome, telefone com DDD, pagamento e endereço completo quando necessário."); return; }
    lock.current = true; setBusy(true); setError(""); setAttempt(parsed.data);
    try {
      const result = await customerApi<Created>("/api/staff/orders", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      setCreated(result); setCart([]); setAttempt(null);
    } catch (failure) {
      if (failure instanceof CustomerApiError && failure.status < 500) {
        setAttempt(null); setError(failure.message);
      } else {
        setError("Não foi possível confirmar o resultado. Use Consultar envio para recuperar este mesmo pedido sem duplicar os itens. Você também pode conferir a Central de pedidos.");
      }
    } finally { lock.current = false; setBusy(false); }
  }

  if (created) return <section className="table-detail-state"><span className="eyebrow">Pedido lançado no caixa</span><h1>Pedido #{created.order_number}</h1>
    <div className="order-panel"><h2>Enviado para a cozinha</h2><p>{type === "dine_in" ? "Os itens foram adicionados à comanda da mesa." : "O pedido já está confirmado. Acompanhe o preparo na Central de pedidos."}</p>
      <p className="order-total">{type === "dine_in" ? "Total da comanda" : "Total do pedido"}<strong>{money.format(created.total_amount)}</strong></p>
      <div className="cashier-actions"><PillButton onClick={() => { setCreated(null); setTableId(""); setName(""); setPhone(""); setAddress(emptyAddress); setLocationUrl(""); setPayment("pix"); setChange(""); setNotes(""); router.refresh(); }}>Lançar outro pedido</PillButton><ArrowLink href="/orders">Acompanhar pedidos</ArrowLink><ArrowLink href="/cashier">Voltar ao caixa</ArrowLink></div>
    </div></section>;

  return <section className="cashier-new-order table-detail-state">
    <ArrowLink href="/cashier">Voltar ao caixa</ArrowLink>
    <header className="section-heading"><div><span className="eyebrow">Atendimento no caixa</span><h1>Novo pedido</h1><p>Mesa, retirada ou entrega. Tudo segue para a mesma cozinha.</p></div><ArrowButton disabled={disabled} onClick={() => router.refresh()}>Atualizar cardápio</ArrowButton></header>
    {error && <p className="table-notice table-notice-error" role="alert">{error}</p>}
    {!accepting && <p className="table-notice table-notice-info">Este canal está fechado para novos pedidos. Confira as configurações do restaurante.</p>}
    <div className="order-panel cashier-order-fields"><h2>Tipo de atendimento</h2>
      <div className="cashier-actions" role="group" aria-label="Tipo do pedido">{([['dine_in', 'Mesa'], ['pickup', 'Retirada'], ['delivery', 'Entrega']] as const).map(([value, label]) =>
        <button type="button" className="ghost-button" key={value} disabled={disabled} aria-pressed={type === value} onClick={() => { setType(value); setError(""); }}>{label}</button>)}</div>
      {type === "dine_in" ? <label className="field-group">Mesa<select className="order-input" disabled={disabled} value={tableId} onChange={(event) => setTableId(event.target.value)}><option value="">Selecione uma mesa</option>{tables.map((table) => <option key={table.id} value={table.id} disabled={table.status === "closing"}>Mesa {table.table_number} · {TABLE_STATUS_LABELS[table.status]}</option>)}</select><small>Uma mesa livre abre uma comanda; uma mesa ocupada recebe os novos itens.</small></label>
        : <><div className="cashier-customer-fields"><label className="field-group">Nome do cliente<input className="order-input" disabled={disabled} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field-group">Telefone com DDD<input type="tel" className="order-input" disabled={disabled} maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} /></label></div>
          {type === "delivery" && <fieldset className="address-fields"><legend>Endereço de entrega</legend><label className="field-group">Link da localização do cliente<input className="order-input" type="url" maxLength={2048} value={locationUrl} disabled={disabled} onChange={(event) => setLocationUrl(event.target.value)} /></label>{distanceMode && <DeliveryQuoteSummary {...delivery} />}{(Object.keys(emptyAddress) as (keyof typeof emptyAddress)[]).map((key) => <label className="field-group" key={key}>{addressLabels[key]}<input className="order-input" disabled={disabled} maxLength={key === "state" ? 2 : key === "zip_code" ? 9 : key === "number" ? 20 : key === "reference" ? 200 : 120} value={address[key]} onChange={(event) => setAddress((current) => ({ ...current, [key]: key === "state" ? event.target.value.toUpperCase() : event.target.value }))} /></label>)}</fieldset>}
          <label className="field-group">Forma de pagamento<select className="order-input" disabled={disabled} value={payment} onChange={(event) => setPayment(event.target.value)}><option value="pix">Pix</option><option value="card">Cartão</option><option value="cash">Dinheiro</option></select></label>
          {payment === "cash" && <label className="field-group">Troco para (opcional)<input className="order-input" type="number" min={subtotal + fee} step="0.01" disabled={disabled} value={change} onChange={(event) => setChange(event.target.value)} /></label>}
          <p>O pagamento será registrado no fechamento do pedido.</p></>}
    </div>
    <div className="order-layout"><ProductCatalog products={products} categories={categories} disabled={disabled || !accepting} cartCount={cart.length}
      onAdd={(product) => setCart((current) => [...current, { id: uuid(), product, quantity: 1, notes: "" }])} />
      <section className="order-panel cashier-order-cart"><h2>Seu pedido</h2><CartEditor cart={cart} setCart={setCart} busy={disabled} />
        {type !== "dine_in" && <label className="field-group">Observações do pedido<textarea className="order-input" maxLength={500} disabled={disabled} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>}
        <p>Produtos: {money.format(subtotal)}{type === "delivery" && ` · Entrega: ${money.format(fee)}`}</p>
        {belowMinimum && <p role="status">Mínimo em produtos para entrega: {money.format(settings.min_delivery_order)}.</p>}
        <p className="order-total">Total estimado<strong>{money.format(subtotal + fee)}</strong></p>
        <PillButton disabled={busy || (!attempt && (!quoteReady || !cart.length || !accepting || belowMinimum || (type === "dine_in" && !tableId)))} onClick={() => void submit()}>{busy ? "Enviando..." : attempt ? "Consultar envio" : "Enviar para a cozinha"}</PillButton>
        <p>Preços, disponibilidade e total são conferidos ao enviar.</p>
      </section></div>
  </section>;
}
