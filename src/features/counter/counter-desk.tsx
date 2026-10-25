"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { customerApi, CustomerApiError } from "@/features/customer-ordering/public-client";
import { money, type PaymentConfig } from "@/lib/money";
import { uuid } from "@/lib/uuid";
import type { StoredRow } from "@/types/records";
import { counterRequestSchema } from "./validation";
import { CounterPaymentEditor, counterPaymentLines, type CounterPaymentDraft } from "./payment-draft";
import { CounterQueue } from "./counter-queue";

type Product = Pick<StoredRow<"products">, "id" | "name" | "price" | "category_id">;
type Line = { product: Product; quantity: number; notes: string };
type Created = { order: { counter_ticket: number; counter_name: string | null }; receipt_path: string };
type Submission = ReturnType<typeof counterRequestSchema.parse>;
export function CounterDesk({ products, categories, settings, config }: { products: Product[]; categories: { id: string; name: string }[]; settings: StoredRow<"restaurant_settings">; config: PaymentConfig }) {
  const t = useTranslation();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
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
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem("counter-last-category");
        if (saved === "all" || categories.some((entry) => entry.id === saved)) setCategory(saved!);
        const stored = sessionStorage.getItem("counter-pending-request");
        if (stored) { const parsed = counterRequestSchema.safeParse(JSON.parse(stored)); if (parsed.success) { pending.current = parsed.data; setUncertain(true); } }
      } catch { /* Optional browser storage. */ }
    }, 0);
    return () => clearTimeout(timer);
  }, [categories]);
  const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const filtered = products.filter((product) => (category === "all" || product.category_id === category) && product.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function add(product: Product) {
    if (busy || uncertain) return;
    setCart((lines) => { const existing = lines.find((line) => line.product.id === product.id); return existing ? lines.map((line) => line === existing ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line) : [...lines, { product, quantity: 1, notes: "" }]; });
  }
  function clearPending() { pending.current = null; setUncertain(false); try { sessionStorage.removeItem("counter-pending-request"); } catch { /* Optional storage. */ } }
  async function submit() {
    if (lock.current) return;
    if (!pending.current) {
      try {
        pending.current = counterRequestSchema.parse({ request_id: uuid(), payload: { name, items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity, notes: line.notes })) }, lines: settings.counter_payment_timing === "at_order" ? counterPaymentLines(payments, total, config) : [] });
      } catch { setError(t("Confira o nome, os itens e os pagamentos.")); return; }
    }
    try { sessionStorage.setItem("counter-pending-request", JSON.stringify(pending.current)); } catch { /* Keep the UUID in memory. */ }
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await customerApi<Created>("/api/staff/counter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      clearPending(); setCreated(result); setCart([]); setName(""); setPayments(defaultRows()); setSearch(""); requestAnimationFrame(() => input.current?.focus());
    } catch (failure) {
      if (failure instanceof CustomerApiError && failure.status < 500) { clearPending(); setError(failure.message); }
      else { setUncertain(true); setError(t("Envio incerto. Consulte o mesmo pedido antes de lançar outro.")); }
    } finally { lock.current = false; setBusy(false); }
  }
  return <main className="counter-desk"><header className="section-heading"><div><span className="eyebrow">{t("Caixa rápido")}</span><h1>{t("Pedido de balcão")}</h1></div><Link className="back-link" href="/cashier">{t("Caixa e mesas")}</Link></header>
    {created && <section className="order-panel counter-confirmation" role="status"><div className="counter-confirmation-label"><strong className="counter-ticket">{t("Senha {0}").replace("{0}", String(created.order.counter_ticket))}</strong>{created.order.counter_name && <p>{created.order.counter_name}</p>}</div><Link className="primary-button" href={created.receipt_path}>{t("Abrir comprovante")}</Link></section>}
    {error && <p role="alert" className="table-notice table-notice-error">{t(error)}</p>}
    <div className="counter-workspace"><section><label className="field-group">{t("Buscar produto por nome")}<input ref={input} autoFocus className="order-input" type="search" value={search} disabled={busy || uncertain} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && filtered[0]) { event.preventDefault(); add(filtered[0]); } }} /></label>
      <div className="counter-categories" aria-label={t("Categorias")}>{[{ id: "all", name: t("Todos") }, ...categories].map((entry) => <button type="button" key={entry.id} aria-pressed={entry.id === category} className={entry.id === category ? "primary-button" : "ghost-button"} onClick={() => { setCategory(entry.id); try { localStorage.setItem("counter-last-category", entry.id); } catch { /* Optional storage. */ } }}>{entry.name}</button>)}</div>
      <div className="counter-products">{filtered.map((product) => <button type="button" className="order-panel" key={product.id} disabled={busy || uncertain} onClick={() => add(product)}><strong>{product.name}</strong><span>{money.format(product.price)}</span></button>)}</div>
    </section><section className="order-panel counter-cart"><h2>{t("Pedido atual")}</h2>
      <fieldset disabled={busy || uncertain}><label className="field-group">{t("Nome para chamar (opcional)")}<input className="order-input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
        {cart.map((line, index) => <article key={line.product.id}><strong>{line.product.name}</strong><div className="cashier-actions"><button type="button" className="ghost-button" aria-label={t("Diminuir quantidade")} onClick={() => setCart((lines) => lines.map((value, i) => i === index ? { ...value, quantity: Math.max(1, value.quantity - 1) } : value))}>−</button><input aria-label={t("Quantidade")} className="order-input" type="number" min="1" max="99" value={line.quantity} onChange={(event) => setCart((lines) => lines.map((value, i) => i === index ? { ...value, quantity: Number(event.target.value) } : value))} /><button type="button" className="ghost-button" aria-label={t("Aumentar quantidade")} onClick={() => add(line.product)}>+</button><button type="button" className="back-link" onClick={() => setCart((lines) => lines.filter((_, i) => i !== index))}>{t("Remover")}</button></div><label>{t("Observação do item")}<input className="order-input" value={line.notes} maxLength={500} onChange={(event) => setCart((lines) => lines.map((value, i) => i === index ? { ...value, notes: event.target.value } : value))} /></label></article>)}
      </fieldset>
      {settings.counter_payment_timing === "at_order" ? <CounterPaymentEditor rows={payments} onChange={setPayments} total={total} config={config} disabled={busy || uncertain} /> : <p>{t("Pagamento no final, antes da entrega.")}</p>}
      <footer className="counter-total"><strong>{t("Total")}: {money.format(total)}</strong><button type="button" className="primary-button" disabled={busy || (!uncertain && !cart.length)} onClick={() => void submit()}>{t(uncertain ? "Consultar envio" : settings.counter_payment_timing === "at_order" ? "Criar e pagar pedido" : "Enviar para a cozinha")}</button></footer>
    </section></div><CounterQueue greenMinutes={settings.counter_green_minutes} yellowMinutes={settings.counter_yellow_minutes} />
  </main>;
}
