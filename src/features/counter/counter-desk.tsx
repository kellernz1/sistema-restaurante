"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useTranslation } from "@/components/language-provider";
import { customerApi, CustomerApiError } from "@/features/customer-ordering/public-client";
import { money, type PaymentConfig } from "@/lib/money";
import { uuid } from "@/lib/uuid";
import type { StoredRow } from "@/types/records";
import { counterRequestSchema,counterDraftSchema } from "./validation";
import {useAuth} from "@/features/auth/auth-provider";
import { CounterPaymentEditor, counterPaymentLines, type CounterPaymentDraft } from "./payment-draft";
import { CounterQueue } from "./counter-queue";
import { CounterDiscount, type CounterDiscountApproval } from "./counter-discount";
import { Trash2 } from "lucide-react";

type Product = Pick<StoredRow<"products">, "id" | "name" | "price" | "category_id">;
type Line = { product: Product; quantity: number; notes: string };
type Created = { order: { counter_ticket: number; counter_name: string | null }; receipt_path: string };
type Submission = ReturnType<typeof counterRequestSchema.parse>;
export function CounterDesk({ products, categories, settings, config }: { products: Product[]; categories: { id: string; name: string }[]; settings: StoredRow<"restaurant_settings">; config: PaymentConfig }) {
  const t = useTranslation();
  const {user}=useAuth();
  const draftKey=user?`counter-draft:${user.id}`:"";
  const [loadedDraft,setLoadedDraft]=useState("");
  const [restored,setRestored]=useState(false);
  const availableCategories=useMemo(()=>categories.filter(entry=>products.some(product=>product.category_id===entry.id)),[categories,products]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [discountApproval,setDiscountApproval]=useState<CounterDiscountApproval|null>(null);
  const [discountRequested,setDiscountRequested]=useState(false);
  const [discountEpoch,setDiscountEpoch]=useState(0);
  const [name, setName] = useState("");
  const firstMethod = config.enabled_methods.find((method) => method !== "pix" || config.rate);
  const defaultRows = (): CounterPaymentDraft[] => firstMethod ? [{ method: firstMethod, currency: firstMethod === "pix" ? "BRL" : "PYG", allocation: null, received: null }] : [];
  const [payments, setPayments] = useState(defaultRows);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<Submission | null>(null);
  const lock = useRef(false);
  useEffect(()=>{
    if(!draftKey||loadedDraft===draftKey)return;
    const timer=setTimeout(()=>{
      try{
        const stored=sessionStorage.getItem(draftKey),draft=stored?counterDraftSchema.safeParse(JSON.parse(stored)):null;
        if(draft?.success){
          const lines=draft.data.items.flatMap(item=>{const product=products.find(p=>p.id===item.product_id);return product?[{product,quantity:item.quantity,notes:item.notes??""}]:[];});
          setCart(lines);setName(draft.data.name);setPayments(draft.data.payments.filter(row=>config.enabled_methods.includes(row.method)&&(row.currency!=="BRL"||!!config.rate)));setRestored(lines.length>0);
        }
      }catch{/* A missing browser draft never creates a submission. */}
      setLoadedDraft(draftKey);
    },0);return()=>clearTimeout(timer);
  },[draftKey,loadedDraft,products,config]);
  useEffect(()=>{
    if(!draftKey||loadedDraft!==draftKey)return;
    try{if(!cart.length){sessionStorage.removeItem(draftKey);return;}const draft=counterDraftSchema.safeParse({name,items:cart.map(line=>({product_id:line.product.id,quantity:line.quantity,notes:line.notes})),payments});if(draft.success)sessionStorage.setItem(draftKey,JSON.stringify(draft.data));}catch{/* Navigation drafts are best-effort; pending request recovery remains separate. */}
  },[draftKey,loadedDraft,cart,name,payments]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem("counter-last-category");
        if (saved === "all" || availableCategories.some((entry) => entry.id === saved)) setCategory(saved!);
        const stored = sessionStorage.getItem("counter-pending-request");
        if (stored) { const parsed = counterRequestSchema.safeParse(JSON.parse(stored)); if (parsed.success) { pending.current = parsed.data; setUncertain(true); } }
      } catch { /* Optional browser storage. */ }
    }, 0);
    return () => clearTimeout(timer);
  }, [availableCategories]);
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const cartKey=JSON.stringify({name,items:cart.map(line=>({product_id:line.product.id,quantity:line.quantity,notes:line.notes}))});
  const validDiscount=discountApproval?.cartKey===cartKey?discountApproval:null;
  const total=validDiscount?.total??subtotal;
  function invalidateDiscount(){setDiscountApproval(null);setDiscountRequested(false);setDiscountEpoch(v=>v+1);}
  function updateCart(next:SetStateAction<Line[]>){invalidateDiscount();setCart(next);}
  const activeCategory=availableCategories.some(entry=>entry.id===category)?category:"all";
  const filtered = products.filter((product) => (activeCategory === "all" || product.category_id === activeCategory) && product.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function add(product: Product) {
    if (busy || uncertain) return;
    updateCart((lines) => { const existing = lines.find((line) => line.product.id === product.id); return existing ? lines.map((line) => line === existing ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line) : [...lines, { product, quantity: 1, notes: "" }]; });
  }
  function clearPending() { pending.current = null; setUncertain(false); try { sessionStorage.removeItem("counter-pending-request"); } catch { /* Optional storage. */ } }
  async function submit() {
    if (lock.current) return;
    if (!pending.current) {
      if(discountRequested&&!validDiscount){setError(t("Confira e autorize o desconto antes de enviar o pedido."));return;}
      try {
        pending.current = counterRequestSchema.parse({ request_id: uuid(), payload: { name, items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity, notes: line.notes })),...(validDiscount?{discount:validDiscount.payload}:{}) }, lines: settings.counter_payment_timing === "at_order" && total>0 ? counterPaymentLines(payments, total, config) : [] });
      } catch { setError(t("Confira o nome, os itens e os pagamentos.")); return; }
    }
    try { sessionStorage.setItem("counter-pending-request", JSON.stringify(pending.current)); } catch { /* Keep the UUID in memory. */ }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await customerApi<Created>("/api/staff/counter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      clearPending(); invalidateDiscount(); setCreated(result); setCart([]); setName(""); setPayments(defaultRows()); setSearch(""); setRestored(false); requestAnimationFrame(() => input.current?.focus());
    } catch (failure) {
      if (failure instanceof CustomerApiError && failure.status < 500) { clearPending(); invalidateDiscount(); setError(failure.message); }
      else { setUncertain(true); setError(t("Envio incerto. Consulte o mesmo pedido antes de lançar outro.")); }
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className="counter-desk"><header className="section-heading counter-heading"><div><span className="eyebrow">{t("Caixa rápido")}</span><h1>{t("Pedido de balcão")}</h1><p>{t("Selecione os produtos e confira o pedido ao lado.")}</p></div></header>
    {created && <section className="order-panel counter-confirmation" role="status"><div className="counter-confirmation-label"><strong className="counter-ticket">{t("Senha {0}").replace("{0}", String(created.order.counter_ticket))}</strong>{created.order.counter_name && <p>{created.order.counter_name}</p>}</div><Link className="primary-button" href={created.receipt_path}>{t("Abrir comprovante")}</Link></section>}
    {error && <p role="alert" className="table-notice table-notice-error">{t(error)}</p>}
    {restored&&<p className="table-notice table-notice-info" role="status">{t("Rascunho recuperado. Confira os itens e os pagamentos.")} {t("Descontos precisam de nova aprovação após recuperar o rascunho.")}</p>}
    <div className="counter-workspace"><section className="order-panel counter-catalog"><label className="field-group">{t("Buscar produto por nome")}<input ref={input} autoFocus className="order-input" type="search" value={search} disabled={busy || uncertain} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && filtered[0]) { event.preventDefault(); add(filtered[0]); } }} /></label>
      <div className="counter-categories" aria-label={t("Categorias")}>{[{ id: "all", name: t("Todos") }, ...availableCategories].map((entry) => <button type="button" key={entry.id} aria-pressed={entry.id === activeCategory} className={entry.id === activeCategory ? "primary-button" : "ghost-button"} onClick={() => { setCategory(entry.id); try { localStorage.setItem("counter-last-category", entry.id); } catch { /* Optional storage. */ } }}>{entry.name}</button>)}</div>
      <div className="counter-products">{filtered.map((product) => <button type="button" className="order-panel" key={product.id} disabled={busy || uncertain} onClick={() => add(product)}><strong>{product.name}</strong><span>{money.format(product.price)}</span></button>)}</div>
    </section><section className="order-panel counter-cart">
      <header className="counter-cart-header"><h2>{t("Pedido atual")}</h2><span className="counter-cart-count" aria-label={t("Quantidade total de itens")}>{cart.reduce((sum,line)=>sum+line.quantity,0)}</span></header>
      <div className="counter-cart-body">
        <fieldset className="counter-cart-section counter-customer-section" disabled={busy || uncertain}><label className="field-group">{t("Nome para chamar (opcional)")}<input className="order-input" value={name} maxLength={120} onChange={(event) => { invalidateDiscount(); setName(event.target.value); }} /></label></fieldset>
        <fieldset className="counter-cart-section counter-items" disabled={busy || uncertain}><legend>{t("Itens do pedido")}</legend>
          {!cart.length&&<p className="counter-empty">{t("Adicione produtos para começar.")}</p>}
          {cart.map((line,index)=><article className="counter-line" key={line.product.id}>
            <div className="counter-line-heading"><strong>{line.product.name}</strong><span>{money.format(line.product.price*line.quantity)}</span></div>
            <div className="cashier-actions counter-line-controls"><div className="counter-stepper">
              <button type="button" className="ghost-button" aria-label={t("Diminuir quantidade")} onClick={()=>updateCart(lines=>lines.map((value,i)=>i===index?{...value,quantity:Math.max(1,value.quantity-1)}:value))}>−</button>
              <input aria-label={t("Quantidade")} className="order-input" type="number" min="1" max="99" value={line.quantity} onChange={event=>updateCart(lines=>lines.map((value,i)=>i===index?{...value,quantity:Number(event.target.value)}:value))}/>
              <button type="button" className="ghost-button" aria-label={t("Aumentar quantidade")} onClick={()=>add(line.product)}>+</button>
            </div><button type="button" className="back-link counter-line-remove" onClick={()=>updateCart(lines=>lines.filter((_,i)=>i!==index))}><Trash2 size={15} aria-hidden="true"/>{t("Remover")}</button></div>
            <label className="counter-line-notes">{t("Observação do item")}<input className="order-input" value={line.notes} maxLength={500} onChange={event=>updateCart(lines=>lines.map((value,i)=>i===index?{...value,notes:event.target.value}:value))}/></label>
          </article>)}
        </fieldset>
        <section className="counter-cart-section counter-discount-section" aria-label={t("Desconto no pedido")}><CounterDiscount key={`${discountEpoch}:${cartKey}`} cartKey={cartKey} gross={subtotal} disabled={busy||uncertain} onChange={setDiscountApproval} onIntent={setDiscountRequested}/></section>
        <div className="counter-discount-summary"><p><span>{t("Subtotal")}</span><strong>{money.format(subtotal)}</strong></p>{validDiscount&&<p><span>{t("Desconto")}</span><strong>−{money.format(validDiscount.amount)}</strong></p>}</div>
        <section className="counter-cart-section counter-payment-section" aria-label={t("Pagamento no balcão")}>{settings.counter_payment_timing === "at_order" ? total===0&&validDiscount ? <p>{t("Pedido integralmente descontado. Nenhum pagamento será registrado.")}</p> : <CounterPaymentEditor rows={payments} onChange={setPayments} total={total} config={config} disabled={busy || uncertain} /> : <p>{t("Pagamento no final, antes da entrega.")}</p>}</section>
      </div>
      <footer className="counter-total"><strong>{t("Total")}: {money.format(total)}</strong><button type="button" className="primary-button" disabled={busy || (!uncertain && (!cart.length || (discountRequested&&!validDiscount)))} onClick={() => void submit()}>{t(uncertain ? "Consultar envio" : settings.counter_payment_timing === "at_order" ? "Criar e pagar pedido" : "Enviar para a cozinha")}</button></footer>
    </section></div><CounterQueue greenMinutes={settings.counter_green_minutes} yellowMinutes={settings.counter_yellow_minutes} />
  </section>;
}
