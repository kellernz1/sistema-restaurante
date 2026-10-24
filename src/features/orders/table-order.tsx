"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProductCard } from "@/components/product-card";

import { OrderTypeBadge } from "@/components/order-type-badge";
import { TABLE_STATUS_LABELS } from "@/features/tables/table-status";
import { uuid } from "@/lib/uuid";
import type { Database } from "@/types/database.types";
import type { StoredRow } from "@/types/records";
import { createClient } from "@/utils/supabase/client";

type Tables = Database["public"]["Tables"];
type Order = StoredRow<"orders">;
type Product = StoredRow<"products">;
type SentItem = StoredRow<"order_items"> & { products: { name: string } | null };
type CartItem = { id: string; product: Product; quantity: number; notes: string };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const itemLabels = { pending: "Recebido", preparing: "Preparando", ready: "Pronto", delivered: "Entregue" };

export function TableOrder({ initialTable, initialOrder, products, categories }: {
  initialTable: StoredRow<"tables">;
  initialOrder: Order | null;
  products: Product[];
  categories: Tables["categories"]["Row"][];
}) {
  const [supabase] = useState(createClient);
  const [table, setTable] = useState(initialTable);
  const [order, setOrder] = useState(initialOrder);
  const [items, setItems] = useState<SentItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [syncError, setSyncError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const revision = useRef(0);
  const active = !!order && !["closed", "cancelled"].includes(order.status);

  const refresh = useCallback(async () => {
    const version = ++revision.current;
    const [tableResult, orderResult] = await Promise.all([
      supabase.from("tables").select("*").eq("id", initialTable.id).maybeSingle(),
      initialOrder
        ? supabase.from("orders").select("*").eq("id", initialOrder.id).maybeSingle()
        : supabase.from("orders").select("*").eq("table_id", initialTable.id)
          .eq("order_type", "dine_in").not("status", "in", '("closed","cancelled")').maybeSingle(),
    ]);
    const itemResult = orderResult.data
      ? await supabase.from("order_items").select("*, products(name)")
        .eq("order_id", orderResult.data.id).order("created_at").order("id")
      : null;
    if (version !== revision.current) return;
    if (tableResult.error || !tableResult.data || orderResult.error || itemResult?.error) {
      setSyncError("Não foi possível atualizar a comanda. Confira a conexão e tente atualizar.");
    } else {
      setTable(tableResult.data);
      setOrder(orderResult.data);
      setItems(itemResult?.data ?? []);
      setSyncError("");
    }
    setLoading(false);
  }, [supabase, initialTable.id, initialOrder]);

  useEffect(() => {
    let mounted = true;
    const invalidate = () => { revision.current++; };
    const update = () => { if (mounted) void refresh(); };
    const channel = supabase.channel(`table-order-${initialTable.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items",
        ...(initialOrder ? { filter: `order_id=eq.${initialOrder.id}` } : {}) }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `table_id=eq.${initialTable.id}` }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `id=eq.${initialTable.id}` }, update)
      .subscribe((status) => {
        if (!mounted) return;
        if (status === "SUBSCRIBED") update();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncError("Atualização em tempo real indisponível. Use Atualizar para conferir os itens.");
        }
      });
    update();
    const onVisible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", update);
    return () => {
      mounted = false;
      invalidate();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", update);
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh, initialTable.id, initialOrder]);

  async function mutate(action: "submit" | "bill" | "deliver", itemId?: string) {
    if (mutation.current || !active || !order || loading || syncError) return;
    if (action === "submit" && cart.length === 0) return;
    mutation.current = true;
    setBusy(true);
    setNotice("");
    try {
      if (action === "submit") {
        const { error } = await supabase.from("order_items").insert(cart.map((item) => ({
          order_id: order.id, product_id: item.product.id, quantity: item.quantity,
          notes: item.notes.trim() || null, status: "pending" as const,
        })));
        if (error) throw error;
        setCart([]);
        setNotice("Pedido enviado com sucesso!");
      } else if (action === "deliver" && itemId) {
        const { data, error } = await supabase.from("order_items").update({ status: "delivered" })
          .eq("id", itemId).eq("order_id", order.id).eq("status", "ready").select("id");
        if (error || !data?.length) throw error ?? new Error("Item changed");
        setNotice("Item marcado como entregue.");
      } else if (action === "bill") {
        const { data, error } = await supabase.from("tables").update({ status: "closing" })
          .eq("id", table.id).eq("status", "occupied").select("id");
        if (error || !data?.length) throw error ?? new Error("Table changed");
        setNotice("Conta solicitada ao caixa.");
      }
    } catch {
      setNotice("Não foi possível concluir a ação. A comanda pode ter sido encerrada ou alterada, ou um produto pode estar indisponível. Confira os dados atualizados antes de tentar novamente.");
    } finally {
      await refresh();
      mutation.current = false;
      setBusy(false);
    }
  }

  const disabled = busy || !active || loading || !!syncError;
  const total = cart.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0) / 100;
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = products.filter((product) => `${product.name} ${product.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));

  return <section className="table-detail-state">
    <Link className="back-link" href="/waiter">← Mapa de mesas</Link><OrderTypeBadge type="dine_in" />
    <div className="table-detail-heading"><div><span className="eyebrow">{order ? `Comanda #${order.order_number}` : "Sem comanda ativa"}</span>
      <h1>Mesa {table.table_number}</h1>{order && ["qr", "nfc"].includes(order.source) && <p>via {order.source.toUpperCase()}</p>}</div><span className={`table-status-label status-${table.status}`}>{TABLE_STATUS_LABELS[table.status]}</span></div>
    {notice && <p className="table-notice table-notice-info" role="status">{notice}</p>}
    {syncError && <p className="table-notice table-notice-error" role="alert">{syncError}</p>}
    {!active && <p className="table-notice table-notice-info">Esta comanda está encerrada ou não existe. Volte ao mapa para iniciar um atendimento.</p>}
    <div className="order-layout">
      <section className="order-panel"><h2>Cardápio</h2>
        <label className="field-group">Buscar produto<input className="order-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou descrição" /></label>
        {!filtered.length && <p>Nenhum produto disponível para esta busca.</p>}
        {categories.map((category) => {
          const categoryProducts = filtered.filter((product) => product.category_id === category.id);
          return categoryProducts.length ? <section key={category.id}><h3>{category.name}</h3>
            <div className="menu-products">{categoryProducts.map((product) => <ProductCard key={product.id} product={product} disabled={disabled} onAdd={() => setCart((current) => [...current, { id: uuid(), product, quantity: 1, notes: "" }])} />)}</div></section> : null;
        })}
      </section>
      <section className="order-panel"><h2>Novo pedido</h2>
        {!cart.length && <p>Adicione produtos do cardápio para começar.</p>}
        {cart.map((item, index) => <div className="cart-line" key={item.id}>
          <strong>{item.product.name}</strong><span>{money.format(item.product.price * item.quantity)}</span>
          <div className="quantity-control"><button className="ghost-button" disabled={busy} aria-label={`Diminuir quantidade de ${item.product.name}, item ${index + 1}`} onClick={() => setCart((current) => current.flatMap((line) => line.id !== item.id ? [line] : line.quantity > 1 ? [{ ...line, quantity: line.quantity - 1 }] : []))}>−</button>
            <output aria-label={`Quantidade de ${item.product.name}`}>{item.quantity}</output>
            <button className="ghost-button" disabled={busy || item.quantity >= 99} aria-label={`Aumentar quantidade de ${item.product.name}, item ${index + 1}`} onClick={() => setCart((current) => current.map((line) => line.id === item.id ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line))}>+</button>
            <button className="ghost-button" disabled={busy} onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))} aria-label={`Remover ${item.product.name}, item ${index + 1}`}>Remover</button></div>
          <label className="field-group">Observações — item {index + 1}<textarea className="order-input" maxLength={500} disabled={busy} value={item.notes} placeholder="Ex.: sem cebola" onChange={(event) => setCart((current) => current.map((line) => line.id === item.id ? { ...line, notes: event.target.value } : line))} /></label>
        </div>)}
        <p className="order-total">Total estimado <strong>{money.format(total)}</strong></p>
        <button className="primary-button" disabled={disabled || !cart.length} onClick={() => void mutate("submit")}>{busy ? "Aguarde..." : "Enviar pedido"}</button>
      </section>
    </div>
    <section className="order-panel" aria-busy={loading}><div className="table-detail-heading"><h2>Itens enviados</h2><button className="ghost-button" disabled={busy} onClick={() => void refresh()}>Atualizar</button></div>
      {loading ? <p>Carregando itens...</p> : !items.length ? <p>Nenhum item enviado nesta comanda.</p> : <ul className="sent-items">{items.map((item) => <li key={item.id}>
        <div><strong>{item.quantity} × {item.products?.name ?? "Produto"}</strong>{item.notes && <p>Observações: {item.notes}</p>}<p>{money.format(item.unit_price)} por unidade · {money.format(item.unit_price * item.quantity)}</p></div>
        <span className={`item-status item-${item.status}`}>{itemLabels[item.status]}</span>
        {item.status === "ready" && <button className="ghost-button" disabled={disabled} onClick={() => void mutate("deliver", item.id)} aria-label={`Marcar ${item.products?.name ?? "item"} como entregue`}>Marcar entregue</button>}
      </li>)}</ul>}
      <p className="order-total">Total da comanda <strong>{money.format(order?.total_amount ?? 0)}</strong></p>
      <button className="primary-button compact-button" disabled={disabled || table.status !== "occupied"} onClick={() => void mutate("bill")}>{table.status === "closing" ? "Conta já solicitada" : "Pedir a conta"}</button>
    </section>
  </section>;
}
