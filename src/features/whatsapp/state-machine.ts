import { addressSchema } from "../customer-ordering/offsite-validation";
import { paginate, summary, text, totals, trim } from "./messages.pt-BR";
import type { Context, Environment, Input, Reply, Session, Transition } from "./types";

const fields = ["street", "number", "neighborhood", "city", "state", "zip_code", "complement", "reference"] as const;
const blank = (now: number): Session => ({ state: "type", context: { cart: [] }, needs_human: false, opted_out: false, last_message_at: new Date(now).toISOString() });
const buttons = (body: string, entries: [string, string][]): Reply => ({ kind: "buttons", body, buttons: entries.map(([id, title]) => ({ id, title })) });

export function transitionToMenuLink(previous: Session, input: Input, env: Environment): Transition {
  const value = input.text.trim().toLocaleLowerCase("pt-BR");
  // Keep consent and handoff handling shared, but never resume a conversational cart.
  const result = transition({ ...previous, state: "welcome", context: { cart: [] } }, input, env);
  if (["parar", "sair", "atendente", "cancelar"].includes(value)
    || result.session.needs_human || result.session.opted_out
    || !env.settings.is_accepting_orders || !env.settings.whatsapp_enabled) return result;

  const raw = input.text.trim();
  const table = raw.startsWith("MESA-") && env.settings.dine_in_qr_enabled
    ? env.tables.find((entry) => entry.qr_token === raw.slice(5) && entry.status !== "closing")
    : undefined;
  result.session = { ...result.session, state: "type", context: { cart: [] } };
  const replies: Reply[] = [];
  if (table) {
    replies.push({ kind: "text", body: `Olá! Faça seu pedido pelo cardápio da mesa ${table.table_number}:\n${env.appUrl}/t/${encodeURIComponent(table.qr_token)}\n\nEscolha os pratos, confira os itens e finalize na página. Para falar com a equipe, digite atendente.` });
  } else if (env.settings.pickup_enabled || env.settings.delivery_enabled) {
    replies.push({ kind: "text", body: `Olá! Acesse nosso cardápio e faça seu pedido:\n${env.appUrl}/order\n\nNa página você escolhe os pratos, ${env.settings.pickup_enabled && env.settings.delivery_enabled ? "retirada ou entrega" : env.settings.pickup_enabled ? "retirada" : "entrega"}, informa seus dados e finaliza o pedido. Para falar com a equipe, digite atendente.${env.settings.dine_in_qr_enabled ? "\n\nEstá no restaurante? Use o QR code da sua mesa para pedir." : ""}\nDigite parar para pausar as mensagens.` });
  } else {
    replies.push({ kind: "text", body: env.settings.dine_in_qr_enabled ? "Para fazer seu pedido, acesse o cardápio pelo QR code da sua mesa. Se precisar de ajuda, digite atendente." : text.closed });
  }
  return { session: result.session, replies };
}

export function prompt(session: Session, env: Environment): Reply[] {
  const c = session.context;
  switch (session.state) {
    case "type": return [...(env.settings.dine_in_qr_enabled || env.settings.pickup_enabled || env.settings.delivery_enabled ? [buttons(text.welcome, [...(env.settings.dine_in_qr_enabled ? [["dine_in", "Local"] as [string, string]] : []), ...(env.settings.pickup_enabled ? [["pickup", "Retirada"] as [string, string]] : []), ...(env.settings.delivery_enabled ? [["delivery", "Entrega"] as [string, string]] : [])])] : [{ kind: "text" as const, body: text.closed }]), { kind: "text", body: `${text.link} ${env.appUrl}/order` }];
    case "table": return [{ kind: "text", body: text.table }];
    case "categories": return [paginate(env.categories.filter((item) => env.products.some((product) => product.category_id === item.id)).map((item) => ({ id: `category:${item.id}`, title: item.name })), c.page ?? 0, "categories", text.categories)];
    case "products": return [paginate(env.products.filter((item) => item.category_id === c.category_id).map((item) => ({ id: `product:${item.id}`, title: item.name, description: `R$ ${item.price.toFixed(2).replace(".", ",")}` })), c.page ?? 0, "products", text.products)];
    case "quantity": return [{ kind: "list", body: text.quantity, rows: ["1", "2", "3", "Outro"].map((title) => ({ id: title === "Outro" ? "other_quantity" : title, title })) }];
    case "notes": return [buttons(text.notes, [["skip", text.skip]])];
    case "cart": return [...summary(c, env), buttons(text.cart, [["add", "Adicionar mais"], ["finish", "Finalizar"], ["cancelar", "Cancelar"]])];
    case "name": return [{ kind: "text", body: text.name }];
    case "addresses": return [paginate([...env.addresses.map((item) => ({ id: `address:${item.id}`, title: `${item.address.street}, ${item.address.number}`, description: item.address.neighborhood })), { id: "new_address", title: text.newAddress }], c.page ?? 0, "addresses", text.addresses)];
    case "address": return [{ kind: "text", body: text.fields[fields[c.address_index ?? 0]] }];
    case "payment": return [buttons(text.payment, [["cash", "Dinheiro"], ["card", "Cartão"], ["pix", "Pix"]])];
    case "change": return [{ kind: "text", body: text.change }];
    case "confirm": return [...summary(c, env), buttons(text.confirm, [["confirm", "Confirmar"], ["edit", "Editar"], ["cancelar", "Cancelar"]])];
    case "edit": return [paginate([
      ...c.cart.map((line, index) => ({ id: `remove:${index}`, title: `${text.remove} ${index + 1}`, description: env.products.find((product) => product.id === line.product_id)?.name })),
      { id: "edit_name", title: text.editName }, ...(c.order_type === "delivery" ? [{ id: "edit_address", title: text.editAddress }] : []),
      { id: "edit_payment", title: text.editPayment }, { id: "back", title: text.back },
    ], c.page ?? 0, "edit", text.edit)];
    case "done": return [{ kind: "text", body: text.sent }];
    default: return [{ kind: "text", body: text.invalid }];
  }
}

export function transition(previous: Session, input: Input, env: Environment): Transition {
  let s: Session = structuredClone(previous); const prefix: Reply[] = [];
  const raw = input.text.trim(); const value = raw.toLocaleLowerCase("pt-BR");
  const result = (submit = false): Transition => ({ session: s, replies: [...prefix, ...prompt(s, env)], ...(submit ? { submit: true } : {}) });
  if (["parar", "sair"].includes(value)) { s.opted_out = true; return { session: s, replies: [{ kind: "text", body: text.optout }] }; }
  if (s.needs_human) return { session: s, replies: [] };
  if (value === "atendente") { s.needs_human = true; return { session: s, replies: [{ kind: "text", body: text.human, handoff: true }] }; }
  if (s.opted_out && value !== "menu") return { session: s, replies: [] };
  if (value === "menu") s.opted_out = false;
  if (value === "cancelar") { s = blank(env.now); s.state = "welcome"; return { session: s, replies: [{ kind: "text", body: text.cancelled }] }; }
  if (!env.settings.is_accepting_orders || !env.settings.whatsapp_enabled) return { session: s, replies: [{ kind: "text", body: text.closed }] };
  if (env.now - Date.parse(s.last_message_at) > 2 * 60 * 60 * 1000) { s = blank(env.now); prefix.push({ kind: "text", body: text.expired }); }
  if (value === "menu" || s.state === "welcome" || raw.startsWith("MESA-")) {
    s = blank(env.now);
    if (raw.startsWith("MESA-")) { const table = env.tables.find((item) => item.qr_token === raw.slice(5)); if (table && env.settings.dine_in_qr_enabled) { s.context = { cart: [], order_type: "dine_in", table_id: table.id, table_token: table.qr_token }; s.state = "categories"; } }
    return result();
  }
  const c: Context = s.context;
  let valid = true;
  if (value.startsWith("more:") && ["categories", "products", "addresses", "edit"].includes(s.state)) {
    const [, scope, page] = value.split(":");
    if (scope === s.state && /^\d{1,4}$/.test(page)) c.page = Number(page); else valid = false;
  } else switch (s.state) {
    case "type":
      if (value === "dine_in" && env.settings.dine_in_qr_enabled) { c.order_type = "dine_in"; s.state = "table"; }
      else if ((value === "pickup" && env.settings.pickup_enabled) || (value === "delivery" && env.settings.delivery_enabled)) { c.order_type = value; c.customer_name = env.customerName; s.state = "categories"; }
      else valid = false;
      break;
    case "table": {
      const table = raw.startsWith("MESA-") ? env.tables.find((item) => item.qr_token === raw.slice(5)) : env.tables.find((item) => String(item.table_number) === raw);
      if (!table || table.status === "closing") { valid = false; break; }
      if (!raw.startsWith("MESA-") && table.status !== "available") { prefix.push({ kind: "text", body: text.tableBusy }); break; }
      c.table_id = table.id; c.table_token = raw.startsWith("MESA-") ? table.qr_token : undefined; s.state = "categories"; break;
    }
    case "categories":
      if (env.categories.some((item) => `category:${item.id}` === raw)) { c.category_id = raw.slice(9); c.page = 0; s.state = "products"; } else valid = false;
      break;
    case "products":
      if (env.products.some((item) => `product:${item.id}` === raw && item.category_id === c.category_id)) { c.product_id = raw.slice(8); s.state = "quantity"; } else valid = false;
      break;
    case "quantity":
      if (/^\d{1,2}$/.test(raw) && Number(raw) > 0) { c.quantity = Number(raw); s.state = "notes"; } else if (value !== "other_quantity") valid = false;
      break;
    case "notes":
      if (raw.length > 200 || !raw || !c.product_id || !c.quantity) valid = false;
      else if (c.cart.length >= 20) { prefix.push({ kind: "text", body: text.limit }); s.state = "cart"; }
      else { c.cart.push({ product_id: c.product_id, quantity: c.quantity, notes: ["skip", "pular"].includes(value) ? "" : raw }); s.state = "cart"; }
      break;
    case "cart":
      if (value === "add") { c.page = 0; s.state = "categories"; }
      else if (value === "finish" && c.cart.length) {
        if (c.order_type === "delivery" && totals(c, env).subtotal < env.settings.min_delivery_order) prefix.push({ kind: "text", body: text.minimum });
        else s.state = c.customer_name ? c.order_type === "delivery" ? "addresses" : "payment" : "name";
      } else valid = false;
      break;
    case "name":
      if (raw.length < 2 || raw.length > 80) valid = false;
      else { c.customer_name = raw; c.page = 0; s.state = c.order_type === "delivery" ? "addresses" : "payment"; }
      break;
    case "addresses": {
      const selected = env.addresses.find((item) => `address:${item.id}` === raw);
      if (selected) { c.address = selected.address; s.state = "payment"; }
      else if (value === "new_address") { c.address = {}; c.address_index = 0; s.state = "address"; }
      else valid = false;
      break;
    }
    case "address": {
      if (input.location) { c.location = `${input.location.latitude},${input.location.longitude}`; prefix.push({ kind: "text", body: text.location }); break; }
      const field = fields[c.address_index ?? 0];
      const entry = ["complement", "reference"].includes(field) && value === "pular" ? "" : field === "state" ? raw.toUpperCase() : raw;
      const check = addressSchema.shape[field].safeParse(entry);
      if (!check.success) { valid = false; break; }
      c.address = { ...c.address, [field]: check.data }; c.address_index = (c.address_index ?? 0) + 1;
      if (c.address_index === fields.length) { if (c.location) c.address.reference = trim(`${c.address.reference ?? ""} Localização: ${c.location}`.trim(), 200); s.state = "payment"; }
      break;
    }
    case "payment":
      if (["cash", "card", "pix"].includes(value)) { c.payment_method = value as Context["payment_method"]; delete c.cash_change_for; s.state = value === "cash" ? "change" : "confirm"; } else valid = false;
      break;
    case "change": {
      const amount = Number(raw.replace(",", "."));
      if (value === "exato") { delete c.cash_change_for; s.state = "confirm"; }
      else if (/^\d{1,6}([.,]\d{1,2})?$/.test(raw) && amount >= totals(c, env).total) { c.cash_change_for = amount; s.state = "confirm"; }
      else valid = false;
      break;
    }
    case "confirm":
      if (value === "edit") { c.page = 0; s.state = "edit"; }
      else if (value === "confirm") {
        if (!c.cart.length) { s.state = "categories"; valid = false; break; }
        if (!c.customer_name || c.customer_name.trim().length < 2) { s.state = "name"; valid = false; break; }
        if (!c.payment_method) { s.state = "payment"; valid = false; break; }
        if (c.order_type === "delivery" && !addressSchema.safeParse(c.address).success) { c.address_index = 0; s.state = "address"; valid = false; break; }
        if (c.cart.some((line) => !env.products.some((product) => product.id === line.product_id))) { prefix.push({ kind: "text", body: text.unavailable }); break; }
        if (c.order_type === "delivery" && totals(c, env).subtotal < env.settings.min_delivery_order) { prefix.push({ kind: "text", body: text.minimum }); s.state = "cart"; break; }
        if (c.cash_change_for !== undefined && c.cash_change_for < totals(c, env).total) { s.state = "change"; valid = false; break; }
        s.state = "done"; return { session: s, replies: [], submit: true };
      } else valid = false;
      break;
    case "edit":
      if (/^remove:\d{1,2}$/.test(value) && Number(value.slice(7)) < c.cart.length) { c.cart.splice(Number(value.slice(7)), 1); s.state = c.cart.length ? "cart" : "categories"; }
      else if (value === "edit_name") s.state = "name";
      else if (value === "edit_address" && c.order_type === "delivery") { c.page = 0; s.state = "addresses"; }
      else if (value === "edit_payment") s.state = "payment";
      else if (value === "back") s.state = "confirm";
      else valid = false;
      break;
    default: valid = false;
  }
  if (!valid) prefix.push({ kind: "text", body: text.invalid });
  return result();
}
