import { money, brl } from "../../lib/money.ts";
import type {CashReport} from "../cash-sessions/types.ts";

export type PrintBlock = { type: "text"; text: string; bold?: boolean; large?: boolean; center?: boolean } | { type: "rule" } | { type: "qr"; value: string } | { type: "cut" };
export type PrintDevice = { id: string; name: string; driver: "browser" | "file"; paper_mm: 58 | 80; columns: number; codepage: "cp860" | "cp850"; codepage_number: number; locale: "pt-BR" | "es"; last_success_at?: string | null };
export type PrintSnapshot = { cash_report?:CashReport;restaurant?: string; timezone?: string; date?: string; number?: number; ticket?: number | null; name?: string | null; table?: number | null; orderType?:string; notes?:string|null; total?: number; token?: string; items?: { id: string; name: string; quantity: number; notes: string | null; price: number }[]; payments?: { method: string; currency: string; original: number; equivalent: number; change: number; rate: string | null }[] };
export type PrintJob = { id: string; order_id: string | null; kind: "kitchen" | "receipt" | "test"|"cash_session"; destination: string; additional: boolean; reprint: boolean; snapshot: PrintSnapshot; device: PrintDevice; status: string; owner_id?: string; claim_token?: string; error_message?: string | null; created_at?: string; reviewed_at?:string|null;reviewed_by?:string|null;review_decision?:string|null;archived_at?:string|null };
export type PrintDocument = { paperMm: 58 | 80; columns: number; blocks: PrintBlock[] };

export function wrapText(text: string, width: number): string[] {
  if (!Number.isInteger(width) || width < 1 || width > 128) throw new Error("Invalid print width");
  const result: string[] = [];
  for (const paragraph of text.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (line && Array.from(line + " " + word).length > width) { result.push(line); line = ""; }
      let rest = word;
      while (Array.from(rest).length > width) {
        if (line) { result.push(line); line = ""; }
        result.push(Array.from(rest).slice(0, width).join("")); rest = Array.from(rest).slice(width).join("");
      }
      if (rest) line += (line ? " " : "") + rest;
    }
    result.push(line);
  }
  return result;
}

export function buildPrintDocument(job: Pick<PrintJob, "kind" | "additional" | "reprint" | "snapshot" | "device">, appUrl: string): PrintDocument {
  const s = job.snapshot; const es = job.device.locale === "es";
  const blocks: PrintBlock[] = [];
  const text = (value: string, bold = false, large = false, center = false) => blocks.push({ type: "text", text: value, bold, large, center });
  if (job.reprint) text(es ? "REIMPRESIÓN" : "REIMPRESSÃO", true, true, true);
  if (job.additional) text("ADICIONAL", true, true, true);
  if(job.kind==="cash_session"){
    const r=s.cash_report;if(!r||!r.payments||r.counted===undefined)throw new Error("Closed cash report required");
    text(s.restaurant??"Mesa Certa",true,false,true);
    text(es?"CIERRE DE CAJA":"FECHAMENTO DE CAIXA",true,true,true);
    text(r.operator_name??r.session.operator_id,true);text(`${r.session.business_date} · ${es?"Revisión":"Revisão"} ${r.session.revision}`);
    if(s.date)text(new Date(s.date).toLocaleString(es?"es-PY":"pt-BR",{timeZone:s.timezone??"America/Asuncion"}));
    blocks.push({type:"rule"});
    for(const [label,value] of [[es?"Fondo inicial":"Fundo inicial",r.session.opening_amount],[es?"Entradas":"Suprimentos",r.supply??0],[es?"Retiros":"Sangrias",r.withdrawal??0],[es?"Efectivo neto":"Dinheiro líquido",r.payments.cash_net],[es?"Esperado":"Esperado",r.expected??0],[es?"Contado":"Contado",r.counted],[es?"Diferencia":"Diferença",r.difference??0]] as [string,number][])text(`${label}: ${money.format(value)}`,true);
    blocks.push({type:"rule"});
    const labels:Record<string,string>=es?{cash:"Efectivo",transfer:"Transferencia",card:"Tarjeta",pix:"Pix"}:{cash:"Dinheiro",transfer:"Transferência",card:"Cartão",pix:"Pix"};
    for(const row of r.payments.methods){text(`${labels[row.method]} ${row.currency}: ${row.currency==="BRL"?brl.format(row.original):money.format(row.original)}`);text(`${es?"Equivalente neto":"Equivalente líquido"}: ${money.format(row.net)}`);}
    text(`${es?"Ajuste de redondeo (separado)":"Ajuste de arredondamento (separado)"}: ${money.format(r.payments.rounding_adjustment)}`);
    text(`${es?"Total recibido":"Total recebido"}: ${money.format(r.payments.total)}`,true);
    text(`${es?"Pedidos":"Pedidos"}: ${r.payments.order_count}`);
    for(const row of r.payments.types)text(`${({counter:es?"Mostrador":"Balcão",pickup:"Retirada",delivery:"Entrega",dine_in:"Local"} as Record<string,string>)[row.type]??row.type}: ${row.orders} · ${money.format(row.net)}`);
    text(`${es?"Tasas de entrega":"Taxas de entrega"}: ${money.format(r.payments.delivery_fees)}`);
    text(`${es?"Cancelados/rechazados":"Cancelados/recusados"}: ${r.payments.cancellations.count} · ${money.format(r.payments.cancellations.amount)}`);
    for(const movement of r.movements??[])text(`${movement.kind==="supply"?(es?"Entrada":"Suprimento"):(es?"Retiro":"Sangria")}: ${money.format(movement.amount)} · ${movement.reason}`);
    if(r.notes)text(r.notes);
    if(r.unpaid.length){text(es?"Pedidos sin pagar (no modificados)":"Pedidos não pagos (não alterados)",true);for(const order of r.unpaid)text(`#${order.number}${order.ticket!=null?` / ${order.ticket}`:""} · ${money.format(order.total)}`);}
    text(es?"Informe interno no fiscal":"Relatório interno não fiscal",false,false,true);blocks.push({type:"cut"});
    return {paperMm:job.device.paper_mm,columns:job.device.columns,blocks};
  }
  if (job.kind === "test") {
    text(es ? "PRUEBA DE IMPRESIÓN" : "TESTE DE IMPRESSÃO", true, true);
    text("ã õ ç á é í ó ú ñ ¿ ¡");
    text("1234567890".repeat(7).slice(0, job.device.columns));
    text("-".repeat(job.device.columns));
    text(es ? "Texto grande y negrita" : "Texto grande e negrito", true, true);
    text("Gs. 25.000");
    blocks.push({ type: "qr", value: new URL("/", appUrl).href }, { type: "cut" });
    return { paperMm: job.device.paper_mm, columns: job.device.columns, blocks };
  }
  text(s.restaurant ?? "Mesa Certa", true, false, true);
  text(job.kind === "kitchen" ? (es ? "COCINA" : "COZINHA") : (es ? "COMPROBANTE" : "COMPROVANTE"), true, false, true);
  text(s.ticket != null ? `${es ? "TURNO" : "SENHA"} ${s.ticket}` : `${es ? "PEDIDO" : "PEDIDO"} #${s.number}`, true, true, true);
  if (s.name) text(s.name, true, false, true);
  if (s.table != null) text(`Mesa ${s.table}`, true);
  if (s.orderType) text(({ dine_in: es?"LOCAL":"LOCAL",pickup:es?"RETIRADA":"RETIRADA",delivery:es?"ENTREGA":"ENTREGA" } as Record<string,string>)[s.orderType] ?? s.orderType,true);
  if (s.date) text(new Date(s.date).toLocaleString(es ? "es-PY" : "pt-BR", { timeZone: s.timezone ?? "America/Asuncion" }));
  blocks.push({ type: "rule" });
  for (const item of s.items ?? []) {
    text(`${item.quantity} x ${item.name}`, true);
    if (item.notes) text(`${es ? "OBSERVACIONES" : "OBSERVAÇÕES"}: ${item.notes}`, true);
    if (job.kind === "receipt") text(money.format(item.price * item.quantity));
    blocks.push({ type: "rule" });
  }
  text(`${es ? "Total del pedido" : "Total do pedido"}: ${money.format(s.total ?? 0)}`, true);
  if (s.notes) text(`${es?"OBSERVACIONES DEL PEDIDO":"OBSERVAÇÕES DO PEDIDO"}: ${s.notes}`,true);
  if (job.kind === "receipt") {
    for (const p of s.payments ?? []) {
      const labels: Record<string, string> = es ? { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", pix: "Pix" } : { cash: "Dinheiro", transfer: "Transferência", card: "Cartão", pix: "Pix" };
      text(`${labels[p.method] ?? p.method}: ${p.currency === "BRL" ? brl.format(p.original) : money.format(p.original)}`);
      if (p.rate) text(`${es ? "Cotización" : "Cotação"}: ${p.rate}`);
      if (p.change) text(`${es ? "Vuelto" : "Troco"}: ${money.format(p.change)}`);
    }
    if (!s.payments?.length) text(es ? "Pago pendiente" : "Pagamento pendente");
  }
  if (s.token) blocks.push({ type: "qr", value: new URL(`/track/${s.token}`, appUrl).href });
  if (job.kind === "receipt") text(es ? "Comprobante no fiscal" : "Comprovante não fiscal", false, false, true);
  blocks.push({ type: "cut" });
  return { paperMm: job.device.paper_mm, columns: job.device.columns, blocks };
}
