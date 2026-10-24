"use client";

import { ProductCard } from "@/components/product-card";

import { type Dispatch, type SetStateAction, useRef, useState } from "react";

export type CatalogProduct = { id: string; category_id: string; name: string; price: number; description: string | null; image_version?: string | null };
export type CatalogCategory = { id: string; name: string };
export type CartLine = { id: string; product: CatalogProduct; quantity: number; notes: string };
export const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function cartSubtotal(cart: CartLine[]) { return cart.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0) / 100; }

export function ProductCatalog({ products, categories, disabled, cartCount, onAdd, pageSize, categoryPages = false }: {
  products: CatalogProduct[]; categories: CatalogCategory[]; disabled: boolean; cartCount: number; onAdd: (product: CatalogProduct) => void; pageSize?: number; categoryPages?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const availableCategories = categories.filter((category) => products.some((product) => product.category_id === category.id));
  const activeCategory = categoryPages ? availableCategories.find((category) => category.id === categoryId)?.id ?? availableCategories[0]?.id ?? "" : categoryId;
  const filtered = products.filter((product) => (!pageSize || !activeCategory || product.category_id === activeCategory) && `${product.name} ${product.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  const ordered = categories.flatMap((category) => filtered.filter((product) => product.category_id === category.id));
  const totalPages = pageSize ? Math.max(1, Math.ceil(ordered.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const visible = pageSize ? ordered.slice((currentPage - 1) * pageSize, currentPage * pageSize) : filtered;
  function changePage(next: number) {
    setPage(next);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  return <section className="order-panel paginated-catalog"><h2 ref={heading} tabIndex={-1}>Cardápio</h2>
    {categoryPages && <nav className="catalog-category-pages" aria-label="Tipos de produtos">{availableCategories.map((category) => <button type="button" key={category.id} aria-pressed={activeCategory === category.id} onClick={() => { setCategoryId(category.id); setPage(1); setSearch(""); }}><span>{category.name}</span><small>{products.filter((product) => product.category_id === category.id).length}</small></button>)}</nav>}
    <label className="field-group">{categoryPages ? "Buscar nesta categoria" : "Buscar produto"}<input className="order-input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nome ou descrição" /></label>
    {pageSize && <div className="catalog-page-filters">{!categoryPages && <label className="field-group">Categoria<select className="order-input" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}<p role="status">{ordered.length} {ordered.length === 1 ? "produto" : "produtos"} · {visible.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, ordered.length)}` : "0"} nesta página</p></div>}
    {!visible.length && <p>Nenhum produto encontrado.</p>}
    {categories.map((category) => {
      const entries = visible.filter((product) => product.category_id === category.id);
      return entries.length ? <section className="catalog-category-section" key={category.id}><h3>{category.name}</h3><div className="menu-products">{entries.map((product) => <ProductCard key={product.id} product={product} disabled={disabled || cartCount >= 50} onAdd={() => onAdd(product)} />)}</div></section> : null;
    })}
    {pageSize && totalPages > 1 && <nav className="catalog-pagination" aria-label="Páginas do cardápio"><button type="button" className="ghost-button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>‹ Anterior</button><span role="status">Página {currentPage} de {totalPages}</span><button type="button" className="ghost-button" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)}>Próxima ›</button></nav>}
  </section>;
}

export function CartEditor({ cart, setCart, busy }: { cart: CartLine[]; setCart: Dispatch<SetStateAction<CartLine[]>>; busy: boolean }) {
  return <>{!cart.length && <p>Seu carrinho está vazio.</p>}{cart.map((line, index) => <div className="cart-line" key={line.id}>
    <strong>{line.product.name}</strong><span>{money.format(line.product.price * line.quantity)}</span>
    <div className="quantity-control"><button className="ghost-button" disabled={busy} aria-label={`Diminuir ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.flatMap((item) => item.id !== line.id ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []))}>−</button><output>{line.quantity}</output><button className="ghost-button" disabled={busy || line.quantity >= 99} aria-label={`Aumentar ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.map((item) => item.id === line.id ? { ...item, quantity: item.quantity + 1 } : item))}>+</button><button className="ghost-button" disabled={busy} aria-label={`Remover ${line.product.name}, item ${index + 1}`} onClick={() => setCart((lines) => lines.filter((item) => item.id !== line.id))}>Remover</button></div>
    <label className="field-group">Observações do item {index + 1}<textarea className="order-input" maxLength={500} disabled={busy} value={line.notes} placeholder="Ex.: sem cebola" onChange={(event) => setCart((lines) => lines.map((item) => item.id === line.id ? { ...item, notes: event.target.value } : item))} /></label>
  </div>)}</>;
}
