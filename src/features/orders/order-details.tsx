"use client";

import { useTranslation } from "@/components/language-provider";


import { useEffect, useRef, useState, type ReactNode } from "react";

import { ArrowButton } from "@/components/ui";

export function OrderDetails({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const t = useTranslation();
  const panel = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [mobile, onClose]);
  return <><button type="button" className="sheet-backdrop orders-screen-only" aria-label={t("Fechar detalhes do pedido")} tabIndex={-1} onClick={onClose} />
    <aside ref={panel} className="order-panel hub-ticket" role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined}
      aria-label={t("Detalhes do pedido")} tabIndex={-1}>
      <div className="sheet-close orders-screen-only"><ArrowButton onClick={onClose}>{t("Fechar detalhes")}</ArrowButton></div>
      {t(children)}
    </aside></>;
}
