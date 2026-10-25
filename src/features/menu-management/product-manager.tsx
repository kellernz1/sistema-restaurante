"use client";
import { MAX_MONEY } from "@/lib/money";


import { useTranslation } from "@/components/language-provider";


import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ProductPhoto } from "@/components/product-photo";
import { ArrowButton, PillButton, StatusPill } from "@/components/ui";
import { money } from "@/features/customer-ordering/menu-cart";
import { customerApi } from "@/features/customer-ordering/public-client";
import { productSchema } from "@/features/menu-management/validation";
import type { Tables } from "@/types/database.types";

type Product = Tables<"products">;
type Category = Pick<Tables<"categories">, "id" | "name">;
type Editor = { id: string | null; name: string; description: string; category_id: string; price: string; is_active: boolean };

function PhotoPreview({ file }: { file: File }) {
  const t = useTranslation();
  const [preview, setPreview] = useState("");
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return preview ? <Image className="photo-preview" src={preview} alt={t("Prévia da foto selecionada")} width={480} height={360} unoptimized /> : <p>{t("Preparando prévia...")}</p>;
}

export function ProductManager({ initialProducts, categories }: { initialProducts: Product[]; categories: Category[] }) {
  const t = useTranslation();
  const [products, setProducts] = useState(initialProducts);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const editingId = editor?.id;
  const editorOpen = editor !== null;
  useEffect(() => { if (editorOpen) editorHeading.current?.focus(); }, [editingId, editorOpen]);

  function upsert(product: Product) {
    setProducts((current) => [...current.filter((entry) => entry.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  }
  function open(product?: Product) {
    setPhoto(null); setError(""); setNotice("");
    setEditor(product ? { id: product.id, name: product.name, description: product.description ?? "", category_id: product.category_id, price: String(product.price), is_active: product.is_active }
      : { id: null, name: "", description: "", category_id: categories[0]?.id ?? "", price: "", is_active: true });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || lock.current) return;
    const parsed = productSchema.safeParse({ name: editor.name, description: editor.description.trim() || null, category_id: editor.category_id, price: editor.price.trim() ? Number(editor.price.replace(",", ".")) : NaN, is_active: editor.is_active });
    if (!parsed.success) { setError(t("Confira nome (2 a 120 caracteres), categoria, descrição e preço com até duas casas decimais.")); return; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    let saved: Product | null = null;
    try {
      const result = await customerApi<{ product: Product }>(editor.id ? `/api/staff/products/${editor.id}` : "/api/staff/products", {
        method: editor.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      saved = result.product; upsert(saved);
      setEditor((current) => current ? { ...current, id: result.product.id } : null);
      if (photo) {
        const form = new FormData(); form.set("photo", photo);
        const uploaded = await customerApi<{ image_version: string }>(`/api/staff/products/${saved.id}/photo`, { method: "POST", body: form });
        upsert({ ...saved, image_version: uploaded.image_version });
      }
      setEditor(null); setPhoto(null); setNotice(t("Produto salvo no cardápio."));
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t("Confira a conexão e tente novamente.");
      setError(saved && photo ? t(`Produto salvo, mas a foto não foi enviada. ${message}`) : message);
    } finally { lock.current = false; setBusy(false); }
  }
  async function update(product: Product, action: "toggle" | "archive" | "restore" | "remove-photo") {
    if (lock.current) return;
    if (action === "archive" && !window.confirm(t(`Remover ${product.name} do cardápio? O histórico dos pedidos será preservado e você poderá restaurar o produto.`))) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "remove-photo") {
        await customerApi(`/api/staff/products/${product.id}/photo`, { method: "DELETE" });
        upsert({ ...product, image_version: null }); setPhoto(null);
      } else {
        const result = await customerApi<{ product: Product }>(`/api/staff/products/${product.id}`, {
          method: action === "archive" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
          ...(action === "archive" ? {} : { body: JSON.stringify(action === "restore" ? { action: "restore" } : { is_active: !product.is_active }) }),
        });
        upsert(result.product);
        if (editor?.id === product.id) { setEditor(null); setPhoto(null); }
      }
      setNotice(action === "archive" ? t("Produto removido do cardápio. O histórico foi preservado.") : action === "restore" ? t("Produto restaurado como indisponível. Ative quando estiver pronto para vender.") : action === "remove-photo" ? t("Foto removida.") : t("Disponibilidade atualizada."));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("Não foi possível atualizar.")); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { const result = await customerApi<{ products: Product[] }>("/api/staff/products"); setProducts(result.products); }
    catch { setError(t("Não foi possível atualizar. Confira a conexão.")); }
    finally { lock.current = false; setBusy(false); }
  }

  const visible = products.filter((product) => {
    const matches = `${product.name} ${product.description ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
    return matches && (filter === "archived" ? product.is_archived : !product.is_archived && (filter === "all" || (filter === "active" ? product.is_active : !product.is_active)));
  });
  const edited = products.find((product) => product.id === editor?.id);
  return <section className="menu-management">
    <header className="section-heading"><div><span className="eyebrow">{t("Administração")}</span><h1>{t("Gerenciar cardápio")}</h1><p>{t("Seus pratos, suas fotos. Tudo pronto para vender.")}</p></div><PillButton disabled={busy || !categories.length} onClick={() => open()}>{t("Adicionar produto")}</PillButton></header>
    {error && <p className="table-notice table-notice-error" role="alert">{t(error)}</p>}{notice && <p className="table-notice table-notice-info" role="status">{t(notice)}</p>}
    {!categories.length && <p role="alert">{t("Nenhuma categoria cadastrada. Configure as categorias antes de adicionar produtos.")}</p>}
    <div className={`menu-management-layout ${editor ? "menu-management-editing" : ""}`}>
      <section className="order-panel menu-management-list" aria-label={t("Produtos do cardápio")}>
        <div className="menu-management-filters"><label className="field-group">{t("Buscar produto")}<input className="order-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Nome ou descrição")} /></label>
          <label className="field-group">{t("Exibir")}<select className="order-input" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t("Todos no cardápio")}</option><option value="active">{t("Disponíveis")}</option><option value="inactive">{t("Indisponíveis")}</option><option value="archived">{t("Removidos")}</option></select></label><ArrowButton disabled={busy} onClick={() => void refresh()}>{t("Atualizar")}</ArrowButton></div>
        <p className="menu-management-count">{t(visible.length)} {t(visible.length === 1 ? t("produto") : t("produtos"))}</p>
        {!visible.length && <p>{t("Nenhum produto neste filtro.")}</p>}
        {visible.map((product) => <article className="managed-product" key={product.id}>
          <div className="managed-product-photo"><ProductPhoto id={product.id} version={product.image_version} name={product.name} /></div>
          <div className="managed-product-copy"><h2>{product.name}</h2><p>{categories.find((category) => category.id === product.category_id)?.name} · {t(money.format(product.price))}</p>
            <StatusPill tone={product.is_archived ? "cancelled" : product.is_active ? "ready" : "open"}>{t(product.is_archived ? t("Removido") : product.is_active ? t("Disponível") : t("Indisponível"))}</StatusPill></div>
          <div className="managed-product-actions">{product.is_archived ? <ArrowButton disabled={busy} onClick={() => void update(product, "restore")}>{t("Restaurar")}</ArrowButton> : <>
            <ArrowButton disabled={busy} onClick={() => open(product)}>{t("Editar")}</ArrowButton><button type="button" className="ghost-button" role="switch" aria-checked={product.is_active} aria-label={t(`Disponibilidade de ${product.name}`)} disabled={busy} onClick={() => void update(product, "toggle")}>{t(product.is_active ? t("Indisponibilizar") : t("Disponibilizar"))}</button>
            <button type="button" className="ghost-button remove-product" disabled={busy} onClick={() => void update(product, "archive")}>{t("Remover")}</button></>}</div>
        </article>)}
      </section>
      {editor && <form className="order-panel product-editor" onSubmit={(event) => void save(event)}>
        <div className="table-detail-heading"><h2 ref={editorHeading} tabIndex={-1}>{t(editor.id ? t("Editar produto") : t("Novo produto"))}</h2><ArrowButton disabled={busy} onClick={() => { setEditor(null); setPhoto(null); }}>{t("Cancelar")}</ArrowButton></div>
        <label className="field-group">{t("Nome")}<input className="order-input" required minLength={2} maxLength={120} disabled={busy} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
        <label className="field-group">{t("Categoria")}<select className="order-input" required disabled={busy} value={editor.category_id} onChange={(event) => setEditor({ ...editor, category_id: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="field-group">{t("Descrição")}<textarea className="order-input" maxLength={1000} disabled={busy} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
        <label className="field-group">{t("Preço (PYG)")}<input className="order-input" type="number" min={0} max={MAX_MONEY} step="1" required disabled={busy} value={editor.price} onChange={(event) => setEditor({ ...editor, price: event.target.value })} /></label>
        <label className="field-group">{t("Foto do prato")}<input key={editor.id ?? "new"} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file && (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setError(t("Selecione JPG, PNG ou WebP de até 5 MB.")); event.target.value = ""; setPhoto(null); return; }
          setPhoto(file); setError("");
        }} /><small>{t("JPG, PNG ou WebP, até 5 MB. A foto será otimizada automaticamente.")}</small></label>
        {photo ? <PhotoPreview key={`${photo.name}:${photo.lastModified}`} file={photo} /> : edited?.image_version && <div className="editor-current-photo"><ProductPhoto id={edited.id} version={edited.image_version} name={edited.name} /></div>}
        {edited?.image_version && <ArrowButton disabled={busy} onClick={() => void update(edited, "remove-photo")}>{t("Remover foto atual")}</ArrowButton>}
        <label><input type="checkbox" disabled={busy} checked={editor.is_active} onChange={(event) => setEditor({ ...editor, is_active: event.target.checked })} /> {t(" Disponível para pedidos")}</label>
        <PillButton type="submit" disabled={busy}>{t(busy ? t("Salvando...") : t("Salvar produto"))}</PillButton>
      </form>}
    </div>
  </section>;
}
