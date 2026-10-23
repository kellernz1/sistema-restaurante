"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Product = { id: string; category_id: string; name: string; price: number; description: string | null };
type Menu = { table_number: number; restaurant_name: string; accepting: boolean; products: Product[]; categories: { id: string; name: string }[] };
type CartLine = { id: string; product: Product; quantity: number; notes: string };
type Tracking = { order_number: number; status: string; items: { id: string; quantity: number; status: string; products: { name: string } | null }[] };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
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
  const base = `/api/public/tables/${encodeURIComponent(token)}`;
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fatal, setFatal] = useState(false);
  const [search, setSearch] = useState("");
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
      setError(failure instanceof Error ? failure.message : "Não foi possível carregar o cardápio.");
      if (failure instanceof MenuError && [403, 404].includes(failure.status)) setFatal(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [base]);

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
        setError(failure instanceof Error ? failure.message : "Não foi possível atualizar o pedido.");
        if (failure instanceof MenuError && [403, 404].includes(failure.status)) { setFatal(true); return; }
        if (failure instanceof MenuError && failure.status === 429) delay = 60000;
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), delay);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, orderId]);

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
        setNotice(`Pedido enviado! Comanda #${result.order_number}. Acompanhe os itens abaixo.`);
      } else {
        await api(`${base}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: action }) });
        setNotice(action === "bill" ? "Conta solicitada. Aguarde o atendimento." : "Garçom chamado. Aguarde o atendimento.");
        if (action === "bill") setMenu((current) => current ? { ...current, accepting: false } : current);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível concluir.");
      if (failure instanceof MenuError && [403, 404].includes(failure.status)) setFatal(true);
    } finally { lock.current = false; setBusy(false); }
  }

  const disabled = busy || loading || fatal || !menu?.accepting;
  const visibleProducts = menu?.products.filter((product) => `${product.name} ${product.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))) ?? [];
  const total = cart.reduce((sum, line) => sum + Math.round(line.product.price * 100) * line.quantity, 0) / 100;

  return <main className="customer-page"><header className="customer-header"><span className="eyebrow">{menu?.restaurant_name ?? "Mesa Certa"}</span>
    <h1>{menu ? `Mesa ${menu.table_number}` : "Cardápio da mesa"}</h1><p>Escolha seus produtos e peça por aqui.</p></header>
    {loading && <p role="status">Carregando cardápio...</p>}
    {error && <p role="alert" className="table-notice table-notice-error">{error}</p>}
    {notice && <p role="status" className="table-notice table-notice-info">{notice}</p>}
    <button className="ghost-button" disabled={loading || busy} onClick={() => void loadMenu()}>Atualizar cardápio</button>
    {menu && !fatal && <>
      {!menu.accepting && <p className="table-notice table-notice-info">No momento esta mesa não está recebendo novos pedidos. Fale com o garçom.</p>}
      <div className="customer-service"><button className="ghost-button" disabled={busy} onClick={() => void send("waiter")}>Chamar garçom</button><button className="ghost-button" disabled={busy} onClick={() => void send("bill")}>Pedir a conta</button></div>
      <div className="order-layout"><section className="order-panel"><h2>Cardápio</h2><label className="field-group">Buscar produto<input className="order-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou descrição" /></label>
        {!visibleProducts.length && <p>Nenhum produto encontrado.</p>}
        {menu.categories.map((category) => {
          const products = visibleProducts.filter((product) => product.category_id === category.id);
          return products.length ? <section key={category.id}><h3>{category.name}</h3>{products.map((product) => <article className="menu-product" key={product.id}><div><strong>{product.name}</strong><p>{product.description}</p><span>{money.format(product.price)}</span></div><button className="ghost-button" disabled={disabled || cart.length >= 50} aria-label={`Adicionar ${product.name}`} onClick={() => setCart((lines) => [...lines, { id: crypto.randomUUID(), product, quantity: 1, notes: "" }])}>Adicionar</button></article>)}</section> : null;
        })}
      </section><section className="order-panel"><h2>Seu pedido</h2>
        {!cart.length && <p>Seu carrinho está vazio.</p>}
        {cart.map((line, index) => <div className="cart-line" key={line.id}><strong>{line.product.name}</strong><span>{money.format(line.product.price * line.quantity)}</span>
          <div className="quantity-control"><button className="ghost-button" disabled={busy} aria-label={`Diminuir ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.flatMap((item) => item.id !== line.id ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []))}>−</button><output>{line.quantity}</output><button className="ghost-button" disabled={busy || line.quantity >= 99} aria-label={`Aumentar ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.map((item) => item.id === line.id ? { ...item, quantity: item.quantity + 1 } : item))}>+</button><button className="ghost-button" disabled={busy} aria-label={`Remover ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.filter((item) => item.id !== line.id))}>Remover</button></div>
          <label className="field-group">Observações do item {index + 1}<textarea className="order-input" maxLength={500} disabled={busy} value={line.notes} placeholder="Ex.: sem cebola" onChange={(event) => setCart((lines) => lines.map((item) => item.id === line.id ? { ...item, notes: event.target.value } : item))} /></label></div>)}
        <label className="field-group">Seu nome (opcional)<input className="order-input" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} autoComplete="given-name" /></label>
        <p className="order-total">Total estimado<strong>{money.format(total)}</strong></p><p>Os valores serão conferidos ao enviar.</p><button className="primary-button" disabled={disabled || !cart.length} onClick={() => void send("order")}>{busy ? "Aguarde..." : "Enviar pedido"}</button>
      </section></div>
    </>}
    {tracking && !fatal && <section className="order-panel"><h2>Comanda #{tracking.order_number}</h2><p role="status">{labels[tracking.status] ?? tracking.status}</p><ul className="sent-items">{tracking.items.map((item) => <li key={item.id}><strong>{item.quantity} × {item.products?.name ?? "Produto"}</strong><span>{labels[item.status] ?? item.status}</span></li>)}</ul></section>}
  </main>;
}
