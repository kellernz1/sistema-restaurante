"use client";

import { useTranslation } from "@/components/language-provider";


import Image from "next/image";
import QRCode from "qrcode";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import { ArrowButton, PillButton } from "@/components/ui";
import { createClient } from "@/utils/supabase/client";

type QrTable = { id: string; table_number: number; qr_token: string };

function QrImage({ url, tableNumber, onReady }: { url: string; tableNumber: number; onReady: (url: string) => void }) {
  const t = useTranslation();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 224 })
      .then((value) => { if (alive) { setSvg(value); setError(false); } })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [url]);
  return error ? <p role="alert">{t("Não foi possível gerar o QR.")}</p> : svg
    ? <Image src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} width={224} height={224} unoptimized onLoad={() => onReady(url)} alt={t(`QR para pedir na Mesa ${tableNumber}`)} />
    : <p role="status">{t("Gerando QR...")}</p>;
}

export function QrSheet({ initialTables, appUrl }: { initialTables: QrTable[]; appUrl: string }) {
  const t = useTranslation();
  const [db] = useState(createClient);
  const [tables, setTables] = useState(initialTables);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [printTableId, setPrintTableId] = useState<string | null>(null);
  const [readyUrls, setReadyUrls] = useState(new Set<string>());
  const onReady = useCallback((url: string) => {
    setReadyUrls((current) => current.has(url) ? current : new Set([...current, url]));
  }, []);
  const lock = useRef(false);
  useEffect(() => {
    const reset = () => setPrintTableId(null);
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);

  function printTable(id: string | null) {
    flushSync(() => setPrintTableId(id));
    window.print();
  }

  async function download(table: QrTable) {
    try {
      const svg = await QRCode.toString(`${appUrl}/t/${table.qr_token}?src=qr`, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 1024 });
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `mesa-${table.table_number}-qr.svg`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setNotice(t("Não foi possível baixar o QR. Tente novamente.")); }
  }

  async function rotate(table: QrTable) {
    if (lock.current || !window.confirm(t(`Renovar o QR da Mesa ${table.table_number}? Os códigos e etiquetas NFC antigos deixarão de funcionar.`))) return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      const { data, error } = await db.rpc("rotate_table_token", { p_table_id: table.id });
      if (error || !data) throw error ?? new Error("No token returned");
      setTables((current) => current.map((item) => item.id === table.id ? { ...item, qr_token: data } : item));
      setNotice(t(`QR da Mesa ${table.table_number} renovado. Imprima o novo código e regrave a etiqueta NFC.`));
    } catch { setNotice(t("Não foi possível renovar. Confira sua conexão e seu acesso de administrador.")); }
    finally { lock.current = false; setBusy(false); }
  }

  return <section className="qr-sheet" data-print-table={printTableId ?? undefined}><header className="qr-screen-only section-heading"><div><span className="eyebrow">{t("Administração")}</span><h1>{t("QR codes das mesas")}</h1><p>{t("Confira o endereço do restaurante antes de imprimir. Cada mesa tem seu próprio código.")}</p></div><ArrowButton disabled={busy || !tables.length || tables.some((table) => !readyUrls.has(`${appUrl}/t/${table.qr_token}?src=qr`))} onClick={() => printTable(null)}>{t("Imprimir folha A4")}</ArrowButton></header>
    {notice && <p className="table-notice table-notice-info qr-screen-only" role="status">{t(notice)}</p>}
    {!tables.length && <p>{t("Nenhuma mesa cadastrada.")}</p>}
    <div className="qr-grid">{tables.map((table) => {
      const url = `${appUrl}/t/${table.qr_token}?src=qr`;
      return <article className="qr-card" key={table.id} data-print-selected={printTableId === table.id}><span className="eyebrow">Mesa Certa</span><h2>{t("Mesa ")}{table.table_number}</h2><p>{t("Escaneie para pedir")}</p><div className="qr-artwork"><QrImage key={url} url={url} tableNumber={table.table_number} onReady={onReady} /></div>
        <a href={url} className="qr-url" rel="noreferrer">{t(url)}</a><p className="qr-screen-only">NFC: {t(`${appUrl}/t/${table.qr_token}?src=nfc`)}</p>
        <div className="lineup-actions qr-screen-only"><PillButton disabled={busy || !readyUrls.has(url)} onClick={() => void download(table)}>{t("Baixar")}</PillButton><ArrowButton disabled={busy || !readyUrls.has(url)} onClick={() => printTable(table.id)}>{t("Imprimir")}</ArrowButton></div><ArrowButton className="qr-screen-only qr-rotate" disabled={busy} onClick={() => void rotate(table)}>{t("Renovar token")}</ArrowButton></article>;
    })}</div>
  </section>;
}
