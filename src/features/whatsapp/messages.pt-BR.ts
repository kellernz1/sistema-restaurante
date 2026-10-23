import type { Context, Environment, Reply } from "./types";

export const text = {
  welcome: "Olá! Vamos fazer seu pedido? Digite menu para reiniciar, cancelar para desistir, atendente para falar com a equipe ou parar para pausar as mensagens.",
  link: "Prefere pedir pelo link?",
  closed: "No momento não estamos recebendo pedidos pelo WhatsApp. Tente mais tarde ou digite atendente.",
  table: "Informe o número da mesa ou envie o código MESA recebido no QR/NFC.",
  tableBusy: "Esta mesa já tem uma comanda. Use o QR da mesa ou fale com um atendente para adicionar itens com segurança.",
  invalid: "Não entendi. Confira as opções abaixo ou digite menu, cancelar ou atendente.",
  categories: "Escolha uma categoria.", products: "Escolha um produto. Os valores serão conferidos no envio.",
  quantity: "Escolha a quantidade ou digite um número de 1 a 99.", notes: "Alguma observação? Ex.: sem cebola. Escreva ou toque em Pular.",
  cart: "Quer adicionar mais itens ou finalizar?", name: "Qual é seu nome?",
  addresses: "Escolha um endereço salvo ou cadastre outro.", payment: "Como deseja pagar ao receber?",
  change: "Troco para quanto? Digite o valor (ex.: 100,00) ou exato para não precisar de troco.",
  minimum: "O valor em produtos ainda não atingiu o mínimo para entrega. Adicione mais itens.",
  confirm: "Confira o pedido. O restaurante ainda precisará confirmar o atendimento.",
  edit: "Escolha o que deseja alterar. Para trocar quantidade ou observações, remova o item e adicione novamente.",
  editName: "Alterar nome", editAddress: "Alterar endereço", editPayment: "Alterar pagamento", back: "Voltar ao resumo", remove: "Remover",
  cancelled: "Pedido cancelado. Digite menu quando quiser começar de novo.",
  expired: "Sua conversa expirou após duas horas. Vamos começar novamente.",
  human: "A equipe foi avisada. Vou pausar as respostas automáticas até o atendimento ser liberado.",
  optout: "Mensagens automáticas pausadas. Digite menu para voltar a pedir ou atendente para ajuda.",
  sent: "Seu pedido foi recebido. Digite menu para fazer um novo pedido.",
  failure: "Não foi possível finalizar. Confira os dados e a disponibilidade. Seu carrinho foi mantido. Digite menu ou atendente se precisar.",
  location: "Localização recebida. Complete também o endereço para a entrega.",
  unavailable: "Um produto ficou indisponível. Remova-o reiniciando com menu ou peça ajuda a um atendente.",
  limit: "Seu carrinho chegou ao limite de 20 itens diferentes. Finalize ou reinicie com menu.",
  newAddress: "Novo endereço", more: "Ver mais", choose: "Escolher", skip: "Pular",
  fields: { street: "Qual é a rua?", number: "Qual é o número?", neighborhood: "Qual é o bairro?", city: "Qual é a cidade?", state: "Qual é a UF (ex.: SP)?", zip_code: "Qual é o CEP?", complement: "Complemento? Digite pular se não houver.", reference: "Ponto de referência? Digite pular se não houver." },
  notifications: { accepted: "Pedido confirmado", rejected: "Pedido recusado", ready: "Pedido pronto", out_for_delivery: "Pedido saiu para entrega", completed: "Pedido concluído" },
  confirmation: "Pedido #{number} recebido! Previsão aproximada: {minutes} minutos. Acompanhe: {url}/track/{token}",
};
export function trim(value: string, length: number) { let result = ""; for (const character of value) { if (result.length + character.length > length) break; result += character; } return result; }
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function totals(context: Context, env: Environment) {
  const subtotal = context.cart.reduce((sum, line) => sum + Math.round((env.products.find((p) => p.id === line.product_id)?.price ?? 0) * 100) * line.quantity, 0) / 100;
  const fee = context.order_type === "delivery" ? env.settings.delivery_fee : 0;
  return { subtotal, fee, total: (Math.round(subtotal * 100) + Math.round(fee * 100)) / 100 };
}
export function paginate(rows: { id: string; title: string; description?: string }[], page: number, scope: string, body: string): Reply {
  const offset = Math.max(0, Math.min(page, Math.max(0, Math.ceil(rows.length / 9) - 1))) * 9;
  const visible = rows.slice(offset, offset + 9).map((row) => ({ ...row, title: trim(row.title, 24), description: row.description ? trim(row.description, 72) : undefined }));
  if (offset + 9 < rows.length) visible.push({ id: `more:${scope}:${page + 1}`, title: text.more, description: undefined });
  else if (offset > 0) visible.push({ id: `more:${scope}:0`, title: text.more, description: undefined });
  return visible.length ? { kind: "list", body, rows: visible } : { kind: "text", body: text.unavailable };
}
export function summary(context: Context, env: Environment): Reply[] {
  const lines = context.cart.map((line) => `${line.quantity} × ${trim(env.products.find((p) => p.id === line.product_id)?.name ?? "Produto", 80)}${line.notes ? ` (${trim(line.notes, 200)})` : ""}`);
  const parts: Reply[] = []; let chunk = "";
  for (const line of lines) {
    if ((chunk + line).length > 900) { parts.push({ kind: "text", body: chunk }); chunk = ""; }
    chunk += `${line}\n`;
  }
  const { fee, total } = totals(context, env);
  chunk += `\nEntrega: ${money.format(fee)}\nTotal estimado: ${money.format(total)}`;
  const types = { dine_in: "Local", pickup: "Retirada", delivery: "Entrega" };
  const payments = { cash: "Dinheiro", card: "Cartão", pix: "Pix" };
  if (context.order_type) chunk += `\n${types[context.order_type]}${context.order_type === "dine_in" ? ` · Mesa ${env.tables.find((table) => table.id === context.table_id)?.table_number ?? "-"}` : ""}`;
  if (context.customer_name) chunk += `\nCliente: ${trim(context.customer_name, 80)}`;
  if (context.payment_method) chunk += `\nPagamento ao receber: ${payments[context.payment_method]}`;
  if (context.cash_change_for !== undefined) chunk += `\nTroco para: ${money.format(context.cash_change_for)}`;
  if (context.address) chunk += `\n${trim(Object.values(context.address).join(", "), 300)}`;
  if (chunk.length > 1000) { parts.push({ kind: "text", body: chunk.slice(0, 900) }); chunk = chunk.slice(900); }
  parts.push({ kind: "text", body: chunk });
  return parts;
}

export function notificationMessage(event: keyof typeof text.notifications, number: number, reason: string | null, link: string, lastMessageAt: number, now: number): Reply {
  const names = { accepted: "order_confirmed", rejected: "order_rejected", ready: "order_ready", out_for_delivery: "order_out_for_delivery", completed: "order_completed" };
  const template = { name: names[event], parameters: [String(number), ...(event === "rejected" ? [trim(reason ?? "-", 300)] : []), link] };
  return now - lastMessageAt < 24 * 60 * 60 * 1000
    ? { kind: "text", body: `${text.notifications[event]} #${number}.${event === "rejected" ? ` ${trim(reason ?? "-", 300)}` : ""}\n${link}`, fallback_template: template }
    : { kind: "template", ...template };
}
