"use client";

import { useTranslation } from "@/components/language-provider";


import { useCallback, useEffect, useRef, useState } from "react";

import { uuid } from "@/lib/uuid";

import { ProductCatalog, CartEditor, cartSubtotal, money, type CatalogProduct as Product, type CartLine } from "./menu-cart";
type Menu = { table_number: number; restaurant_name: string; accepting: boolean; products: Product[]; categories: { id: string; name: string }[] };
type Tracking = { order_number: number; status: string; items: { id: string; quantity: number; status: string; products: { name: string } | null }[] };
const labels: Record<string, string> = { pending_confirmation: "Aguardando confirmação do garçom", open: "Pedido confirmado", ready: "Pedido pronto", closed: "Atendimento concluído", cancelled: "Pedido não confirmado. Chame o garçom.", pending: "Recebido", preparing: "Preparando", delivered: "Entregue" };

class MenuError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new MenuError(response.status, body.error || "Não foi possível concluir. Tente novamente.");
  return body as T;
}

export function TableMenu({ token, source }: { token: string; source: "qr" | "nfc" }) {
  const t = useTranslation();
  const base = `/api/public/tables/${encodeURIComponent(token)}`;
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fatal, setFatal] = useState(false);
  const [name, setName] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const lock = useRef(false);

  const loadMenu = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await api<Menu>(base, { signal });
      if (signal?.aborted) return;
      setMenu(data); setFatal(false); setError("");
    } catch (failure) {
      if (signal?.aborted) return;
      setError(failure instanceof Error ? failure.message : t("Não foi possível carregar o cardápio."));
      if (failure instanceof MenuError && [403, 404].includes(failure.status)) setFatal(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [base, t]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void loadMenu(controller.signal);
      try { setOrderId(sessionStorage.getItem(`table-order:${token}`)); } catch { /* Storage is optional. */ }
    }, 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [loadMenu, token]);

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 5000;
      try {
        const data = await api<Tracking>(`${base}/status?order=${encodeURIComponent(orderId!)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setTracking(data);
        if (["closed", "cancelled"].includes(data.status)) return;
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : t("Não foi possível atualizar o pedido."));
        if (failure instanceof MenuError && [403, 404].includes(failure.status)) { setFatal(true); return; }
        if (failure instanceof MenuError && failure.status === 429) delay = 60000;
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, orderId, t]);

  async function send(action: "order" | "waiter" | "bill") {
    if (lock.current || fatal || (action === "order" && (!cart.length || !menu?.accepting))) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "order") {
        const result = await api<{ order_id: string; order_number: number }>(`${base}/orders`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, customer_name: name.trim(), items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity, notes: line.notes.trim() })) }),
        });
        setCart([]); setOrderId(result.order_id);
        try { sessionStorage.setItem(`table-order:${token}`, result.order_id); } catch { /* Storage is optional. */ }
        setNotice(t(`Pedido enviado! Comanda #${result.order_number}. Acompanhe os itens abaixo.`));
      } else {
        await api(`${base}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: action }) });
        setNotice(action === "bill" ? t("Conta solicitada. Aguarde o atendimento.") : t("Garçom chamado. Aguarde o atendimento."));
        if (action === "bill") setMenu((current) => current ? { ...current, accepting: false } : current);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Não foi possível concluir."));
      if (failure instanceof MenuError && [403, 404].includes(failure.status)) setFatal(true);
    } finally { lock.current = false; setBusy(false); }
  }

  const disabled = busy || loading || fatal || !menu?.accepting;
  const total = cartSubtotal(cart);

  return <main className="customer-page"><header className="customer-header"><span className="eyebrow">{menu?.restaurant_name ?? "Mesa Certa"}</span>
    <h1>{t(menu ? t(`Mesa ${menu.table_number}`) : t("Cardápio da mesa"))}</h1><p>{t("Escolha seus produtos e peça por aqui.")}</p></header>
    {loading && <p role="status">{t("Carregando cardápio...")}</p>}
    {error && <p role="alert" className="table-notice table-notice-error">{t(error)}</p>}
    {notice && <p role="status" className="table-notice table-notice-info">{t(notice)}</p>}
    <button className="ghost-button" disabled={loading || busy} onClick={() => void loadMenu()}>{t("Atualizar cardápio")}</button>
    {menu && !fatal && <>
      {!menu.accepting && <p className="table-notice table-notice-info">{t("No momento esta mesa não está recebendo novos pedidos. Fale com o garçom.")}</p>}
      <div className="customer-service"><button className="ghost-button" disabled={busy} onClick={() => void send("waiter")}>{t("Chamar garçom")}</button><button className="ghost-button" disabled={busy} onClick={() => void send("bill")}>{t("Pedir a conta")}</button></div>
      <div className="order-layout"><ProductCatalog products={menu.products} categories={menu.categories} disabled={disabled} cartCount={cart.length} onAdd={(product) => setCart((lines) => [...lines, { id: uuid(), product, quantity: 1, notes: "" }])} />
      <section className="order-panel"><h2>{t("Seu pedido")}</h2><CartEditor cart={cart} setCart={setCart} busy={busy} />
        <label className="field-group">{t("Seu nome (opcional)")}<input className="order-input" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} autoComplete="given-name" /></label>
        <p className="order-total">{t("Total estimado")}<strong>{t(money.format(total))}</strong></p><p>{t("Os valores serão conferidos ao enviar.")}</p><button className="primary-button" disabled={disabled || !cart.length} onClick={() => void send("order")}>{t(busy ? t("Aguarde...") : t("Enviar pedido"))}</button>
      </section></div>
    </>}
    {tracking && !fatal && <section className="order-panel"><h2>{t("Comanda #")}{tracking.order_number}</h2><p role="status">{t(labels[tracking.status] ?? tracking.status)}</p><ul className="sent-items">{tracking.items.map((item) => <li key={item.id}><strong>{item.quantity} × {item.products?.name ?? t("Produto")}</strong><span>{t(labels[item.status] ?? item.status)}</span></li>)}</ul></section>}
  </main>;
}
