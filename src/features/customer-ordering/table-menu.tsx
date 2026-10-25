"use client";

import { useTranslation } from "@/components/language-provider";


import { useCallback, useEffect, useRef, useState } from "react";

import { uuid } from "@/lib/uuid";
import {FloatingCart} from "./floating-cart";
import {PhoneInput} from "@/components/phone-input";
import type {PhoneCountry} from "@/lib/phone";

import { ProductCatalog, CartEditor, cartSubtotal, money, type CatalogProduct as Product, type CartLine } from "./menu-cart";
type Menu = { table_number: number; restaurant_name: string; accepting: boolean;phone_mode:"required"|"optional"|"off";default_phone_country:PhoneCountry; products: Product[]; categories: { id: string; name: string }[] };
type Tracking = { order_number: number; status: string;reason?:string|null;actor_kind?:string|null; items: { id: string; quantity: number; status: string; products: { name: string } | null }[] };
const labels: Record<string, string> = { pending_confirmation: "Aguardando confirmação do atendente", open: "Pedido confirmado", ready: "Pedido pronto", closed: "Atendimento concluído", cancelled: "Pedido não confirmado. Chame o atendente.", pending: "Recebido", preparing: "Preparando", delivered: "Entregue" };

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
  const [phone,setPhone]=useState(""),[country,setCountry]=useState<PhoneCountry>();
  const access=useRef("");
  const [uncertain,setUncertain]=useState(false);
  const pending=useRef<{request_id:string;source:"qr"|"nfc";customer_name:string;customer_phone:string;phone_country:PhoneCountry;items:{product_id:string;quantity:number;notes:string}[]}|null>(null);
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
      try { setOrderId(sessionStorage.getItem(`table-order:${token}`));access.current=sessionStorage.getItem(`table-access:${token}`)??"";const saved=sessionStorage.getItem(`table-pending:${token}`);if(saved){pending.current=JSON.parse(saved);setUncertain(true);} } catch { /* Storage is optional. */ }
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
        const data = await api<Tracking>(`${base}/status?order=${encodeURIComponent(orderId!)}&access=${access.current}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setTracking(data);
        if (["closed", "cancelled","refused"].includes(data.status)) return;
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
    if (lock.current || fatal || (action === "order" && ((!cart.length&&!pending.current) || !menu?.accepting))) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (action === "order") {
        if(!pending.current){const candidate={request_id:uuid(),source,customer_name:name.trim(),customer_phone:phone,phone_country:country??menu?.default_phone_country??"PY",items:cart.map(line=>({product_id:line.product.id,quantity:line.quantity,notes:line.notes.trim()}))};sessionStorage.setItem(`table-pending:${token}`,JSON.stringify(candidate));pending.current=candidate;}
        const result = await api<{ order_id: string; order_number: number;access_token:string }>(`${base}/orders`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending.current),
        });
        access.current=result.access_token;pending.current=null;setUncertain(false);setCart([]);setTracking(null);setOrderId(result.order_id);
        try {sessionStorage.removeItem(`table-pending:${token}`);sessionStorage.setItem(`table-order:${token}`, result.order_id);sessionStorage.setItem(`table-access:${token}`,result.access_token);} catch { /* Storage is optional. */ }
        setNotice(t("Pedido enviado. Aguarde a confirmação do atendimento."));
      } else {
        await api(`${base}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: action }) });
        setNotice(action === "bill" ? t("Conta solicitada. Aguarde o atendimento.") : t("Atendente chamado. Aguarde o atendimento."));
        if (action === "bill") setMenu((current) => current ? { ...current, accepting: false } : current);
      }
    } catch (failure) {
      if(action==="order"&&pending.current)setUncertain(true);
      if(action==="order"&&failure instanceof MenuError&&failure.status>=400&&failure.status<500&&failure.status!==429){pending.current=null;setUncertain(false);try{sessionStorage.removeItem(`table-pending:${token}`);}catch{/* Storage is optional. */}}
      setError(failure instanceof Error ? failure.message : t("Não foi possível concluir."));
      if (failure instanceof MenuError && [403, 404].includes(failure.status)) setFatal(true);
    } finally { lock.current = false; setBusy(false); }
  }

  const disabled = busy || uncertain || loading || fatal || !menu?.accepting;
  const total = cartSubtotal(cart);

  return <main className="customer-page customer-menu-with-cart"><header className="customer-header"><span className="eyebrow">{menu?.restaurant_name ?? "Mesa Certa"}</span>
    <h1>{t(menu ? t(`Mesa ${menu.table_number}`) : t("Cardápio da mesa"))}</h1><p>{t("Escolha seus produtos e peça por aqui.")}</p></header>
    {loading && <p role="status">{t("Carregando cardápio...")}</p>}
    {error && <p role="alert" className="table-notice table-notice-error">{t(error)}</p>}
    {notice && <p role="status" className="table-notice table-notice-info">{t(notice)}</p>}
    {uncertain&&<button className="primary-button" disabled={busy} onClick={()=>void send("order")}>{t("Consultar envio")}</button>}
    <button className="ghost-button" disabled={loading || busy} onClick={() => void loadMenu()}>{t("Atualizar cardápio")}</button>
    {menu && !fatal && <>
      {!menu.accepting && <p className="table-notice table-notice-info">{t("No momento esta mesa não está recebendo novos pedidos. Fale com o atendente.")}</p>}
      <div className="customer-service"><button className="ghost-button" disabled={busy} onClick={() => void send("waiter")}>{t("Chamar atendente")}</button><button className="ghost-button" disabled={busy} onClick={() => void send("bill")}>{t("Pedir a conta")}</button></div>
      <div className="table-menu-catalog"><ProductCatalog pageSize={6} categoryPages products={menu.products} categories={menu.categories} disabled={disabled} cartCount={cart.length} onAdd={(product) => setCart((lines) => [...lines, { id: uuid(), product, quantity: 1, notes: "" }])} />
      </div>
      <FloatingCart compactOnly quantity={cart.reduce((sum,line)=>sum+line.quantity,0)} total={total} footer={<>{error&&<p role="alert" className="form-error">{t(error)}</p>}{notice&&<p role="status">{notice}</p>}{uncertain&&<button className="ghost-button" disabled={busy} onClick={()=>void send("order")}>{t("Consultar envio")}</button>}<p className="order-total">{t("Total estimado")}<strong>{t(money.format(total))}</strong></p><p>{t("Os valores serão conferidos ao enviar.")}</p><button className="primary-button" disabled={disabled || !cart.length || !name.trim() || menu.phone_mode==="required"&&!phone.trim()} onClick={() => void send("order")}>{t(busy ? t("Aguarde...") : t("Enviar pedido"))}</button></>}>
      <CartEditor cart={cart} setCart={setCart} busy={busy} />
        <label className="field-group">{t("Seu nome")}<input className="order-input" required value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} autoComplete="given-name" /></label>
        {menu.phone_mode!=="off"&&<><PhoneInput value={phone} country={country} defaultCountry={menu.default_phone_country} disabled={busy} onChange={(value,selected)=>{setPhone(value);setCountry(selected);}}/><small>{t(menu.phone_mode==="required"?"Telefone obrigatório":"Telefone opcional")}</small></>}

    {tracking && !fatal && <section className="order-panel"><h2>{t("Seu pedido")}</h2><p role="status">{t(({pending:"Aguardando confirmação",confirmed:"Pedido confirmado",refused:"Pedido recusado",cancelled:tracking.actor_kind==="customer"?"Cancelado pelo cliente":"Cancelado pelo atendimento"} as Record<string,string>)[tracking.status]??labels[tracking.status]??tracking.status)}</p>{tracking.reason&&<p>{tracking.reason}</p>}<ul className="sent-items">{tracking.items.map((item) => <li key={item.id}><strong>{item.quantity} × {item.products?.name ?? t("Produto")}</strong></li>)}</ul>{tracking.status==="pending"&&<button className="ghost-button" disabled={busy} onClick={async()=>{const reason=window.prompt(t("Motivo do cancelamento"));if(!reason?.trim())return;setBusy(true);try{await api(`${base}/cancel`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:orderId,access_token:access.current,reason})});setTracking({...tracking,status:"cancelled",actor_kind:"customer",reason});}catch{setError(t("Só é possível cancelar antes da confirmação."));}finally{setBusy(false);}}}>{t("Cancelar pedido")}</button>}</section>}
      </FloatingCart>
    </>}
  </main>;
}
