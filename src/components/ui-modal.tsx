"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

let locks = 0;
let savedOverflow = "";

export function Modal({ open, title, children, footer, closeLabel, onRequestClose, busy = false, className = "" }: {
  open: boolean; title: ReactNode; children: ReactNode; footer?: ReactNode;
  closeLabel: string; onRequestClose: () => void; busy?: boolean; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (locks++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    element.showModal();
    element.focus();
    return () => {
      element.close();
      if (--locks === 0) document.body.style.overflow = savedOverflow;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return <dialog ref={dialog} tabIndex={-1} className={`ui-modal ${className}`} aria-labelledby={titleId} aria-modal="true" aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onRequestClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(e => e.getClientRects().length && !e.closest("[inert]"));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }}>
    <div className="ui-modal-shell"><header className="ui-modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="ui-dismiss" disabled={busy} aria-label={closeLabel} onClick={onRequestClose}>×</button></header>
      <div className="ui-modal-body">{children}</div>{footer && <footer className="ui-modal-footer">{footer}</footer>}
    </div>
  </dialog>;
}
