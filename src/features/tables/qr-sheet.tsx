"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";

type QrTable = { id: string; table_number: number; qr_token: string };

function QrImage({ url, tableNumber, onReady }: { url: string; tableNumber: number; onReady: (url: string) => void }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 224 })
      .then((value) => { if (alive) { setSvg(value); setError(false); } })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [url]);
  return error ? <p role="alert">Não foi possível gerar o QR.</p> : svg
    ? <Image src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} width={224} height={224} unoptimized onLoad={() => onReady(url)} alt={`QR para pedir na Mesa ${tableNumber}`} />
    : <p role="status">Gerando QR...</p>;
}

export function QrSheet({ initialTables, appUrl }: { initialTables: QrTable[]; appUrl: string }) {
  const [db] = useState(createClient);
  const [tables, setTables] = useState(initialTables);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [readyUrls, setReadyUrls] = useState(new Set<string>());
  const onReady = useCallback((url: string) => {
    setReadyUrls((current) => current.has(url) ? current : new Set([...current, url]));
  }, []);
  const lock = useRef(false);

  async function rotate(table: QrTable) {
    if (lock.current || !window.confirm(`Renovar o QR da Mesa ${table.table_number}? Os códigos e etiquetas NFC antigos deixarão de funcionar.`)) return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      const { data, error } = await db.rpc("rotate_table_token", { p_table_id: table.id });
      if (error || !data) throw error ?? new Error("No token returned");
      setTables((current) => current.map((item) => item.id === table.id ? { ...item, qr_token: data } : item));
      setNotice(`QR da Mesa ${table.table_number} renovado. Imprima o novo código e regrave a etiqueta NFC.`);
    } catch { setNotice("Não foi possível renovar. Confira sua conexão e seu acesso de administrador."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <section className="qr-sheet"><header className="qr-screen-only"><span className="eyebrow">Administração</span><h1>QR codes das mesas</h1><p>Confira o endereço do restaurante antes de imprimir. Cada mesa tem seu próprio código.</p><button className="primary-button" disabled={busy || !tables.length || tables.some((table) => !readyUrls.has(`${appUrl}/t/${table.qr_token}?src=qr`))} onClick={() => window.print()}>Imprimir folha A4</button></header>
    {notice && <p className="table-notice table-notice-info qr-screen-only" role="status">{notice}</p>}
    {!tables.length && <p>Nenhuma mesa cadastrada.</p>}
    <div className="qr-grid">{tables.map((table) => {
      const url = `${appUrl}/t/${table.qr_token}?src=qr`;
      return <article className="qr-card" key={table.id}><span className="eyebrow">Mesa Certa</span><h2>Mesa {table.table_number}</h2><p>Escaneie para pedir</p><QrImage key={url} url={url} tableNumber={table.table_number} onReady={onReady} />
        <a href={url} className="qr-url" rel="noreferrer">{url}</a><p className="qr-screen-only">NFC: {`${appUrl}/t/${table.qr_token}?src=nfc`}</p>
        <button className="ghost-button qr-screen-only" disabled={busy} onClick={() => void rotate(table)}>Renovar token</button></article>;
    })}</div>
  </section>;
}
