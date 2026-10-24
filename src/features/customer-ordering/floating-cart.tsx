"use client";

import { useTranslation } from "@/components/language-provider";


import { ShoppingCart, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { money } from "./menu-cart";

export function FloatingCart({ quantity, total, children, footer }: {
  quantity: number; total: number; children: ReactNode; footer: ReactNode;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onScroll() {
      setCompact(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCompact(false), 1600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    const previousOverflow = document.body.style.overflow;
    panel?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      panel?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return <>
    <button type="button" className={`primary-button floating-cart-button${compact ? " is-compact" : ""}`} aria-label={t(`Ver carrinho, ${quantity} ${t(quantity === 1 ? "item" : "itens")}, total ${money.format(total)}`)} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <ShoppingCart size={25} aria-hidden="true" /><span className="floating-cart-count" aria-hidden="true">{quantity}</span><span className="floating-cart-summary" aria-hidden="true"><span>{t("Ver carrinho")}</span><strong>{t(money.format(total))}</strong></span>
    </button>
    <dialog ref={dialog} className="customer-cart-dialog" aria-labelledby="customer-cart-heading" onCancel={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="customer-cart-shell">
        <header className="customer-cart-header"><div><h2 id="customer-cart-heading">{t("Seu carrinho")}</h2><span>{quantity} {t(quantity === 1 ? "item" : "itens")}</span></div><button type="button" className="ghost-button" aria-label={t("Fechar carrinho")} onClick={() => setOpen(false)} autoFocus><X size={22} aria-hidden="true" /></button></header>
        <div className="customer-cart-content">{t(children)}</div>
        <footer className="customer-cart-footer">{t(footer)}</footer>
      </div>
    </dialog>
  </>;
}
