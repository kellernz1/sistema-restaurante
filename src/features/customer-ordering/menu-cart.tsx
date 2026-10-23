"use client";

import { type Dispatch, type SetStateAction, useState } from "react";

export type CatalogProduct = { id: string; category_id: string; name: string; price: number; description: string | null };
export type CatalogCategory = { id: string; name: string };
export type CartLine = { id: string; product: CatalogProduct; quantity: number; notes: string };
export const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function cartSubtotal(cart: CartLine[]) { return cart.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0) / 100; }

export function ProductCatalog({ products, categories, disabled, cartCount, onAdd }: {
  products: CatalogProduct[]; categories: CatalogCategory[]; disabled: boolean; cartCount: number; onAdd: (product: CatalogProduct) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = products.filter((product) => `${product.name} ${product.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <section className="order-panel"><h2>Cardápio</h2><label className="field-group">Buscar produto<input className="order-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou descrição" /></label>
    {!visible.length && <p>Nenhum produto encontrado.</p>}
    {categories.map((category) => {
      const entries = visible.filter((product) => product.category_id === category.id);
      return entries.length ? <section key={category.id}><h3>{category.name}</h3>{entries.map((product) => <article className="menu-product" key={product.id}><div><strong>{product.name}</strong><p>{product.description}</p><span>{money.format(product.price)}</span></div><button className="ghost-button" disabled={disabled || cartCount >= 50} aria-label={`Adicionar ${product.name}`} onClick={() => onAdd(product)}>Adicionar</button></article>)}</section> : null;
    })}</section>;
}

export function CartEditor({ cart, setCart, busy }: { cart: CartLine[]; setCart: Dispatch<SetStateAction<CartLine[]>>; busy: boolean }) {
  return <>{!cart.length && <p>Seu carrinho está vazio.</p>}{cart.map((line, index) => <div className="cart-line" key={line.id}>
    <strong>{line.product.name}</strong><span>{money.format(line.product.price * line.quantity)}</span>
    <div className="quantity-control"><button className="ghost-button" disabled={busy} aria-label={`Diminuir ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.flatMap((item) => item.id !== line.id ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []))}>−</button><output>{line.quantity}</output><button className="ghost-button" disabled={busy || line.quantity >= 99} aria-label={`Aumentar ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.map((item) => item.id === line.id ? { ...item, quantity: item.quantity + 1 } : item))}>+</button><button className="ghost-button" disabled={busy} aria-label={`Remover ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.filter((item) => item.id !== line.id))}>Remover</button></div>
    <label className="field-group">Observações do item {index + 1}<textarea className="order-input" maxLength={500} disabled={busy} value={line.notes} placeholder="Ex.: sem cebola" onChange={(event) => setCart((lines) => lines.map((item) => item.id === line.id ? { ...item, notes: event.target.value } : item))} /></label>
  </div>)}</>;
}
