import {
  assertResult,
  demoClient,
  DEMO_EMAILS,
  DEMO_PHONES,
  writeManifest,
} from "./demo-data.mjs";
import { clearDemo } from "./clear-demo.mjs";

const staff = [
  { email: DEMO_EMAILS[0], name: "[DEMO] Administrador", role: "admin" },
  { email: DEMO_EMAILS[1], name: "[DEMO] Garçom", role: "waiter" },
  { email: DEMO_EMAILS[2], name: "[DEMO] Garçom 2", role: "waiter" },
  { email: DEMO_EMAILS[3], name: "[DEMO] Cozinha", role: "kitchen" },
  { email: DEMO_EMAILS[4], name: "[DEMO] Caixa", role: "cashier" },
];

async function seedStaff(client, password) {
  const listed = assertResult(await client.auth.admin.listUsers({ page: 1, perPage: 100 }), "list auth users");
  const ids = [];
  for (const account of staff) {
    let user = listed.users.find((candidate) => candidate.email === account.email);
    if (user) {
      user = assertResult(
        await client.auth.admin.updateUserById(user.id, { password, email_confirm: true, user_metadata: { full_name: account.name } }),
        `update ${account.email}`,
      ).user;
    } else {
      user = assertResult(
        await client.auth.admin.createUser({ email: account.email, password, email_confirm: true, user_metadata: { full_name: account.name } }),
        `create ${account.email}`,
      ).user;
    }
    ids.push(user.id);
    assertResult(
      await client.from("profiles").update({ full_name: account.name, role: account.role }).eq("id", user.id),
      `set role for ${account.email}`,
    );
  }
  return ids;
}

function item(product, quantity = 1, notes) {
  return { product_id: product.id, quantity, ...(notes ? { notes } : {}) };
}

async function createOrder(client, payload) {
  return assertResult(await client.rpc("create_customer_order", { p_payload: payload }), "create demo order");
}

async function setOrder(client, id, values) {
  assertResult(await client.from("orders").update(values).eq("id", id), `update demo order ${id}`);
}

async function setItemStatuses(client, orderId, statuses) {
  const rows = assertResult(
    await client.from("order_items").select("id").eq("order_id", orderId).order("created_at"),
    `read items for ${orderId}`,
  );
  for (let index = 0; index < rows.length; index += 1) {
    assertResult(
      await client.from("order_items").update({ status: statuses[Math.min(index, statuses.length - 1)] }).eq("id", rows[index].id),
      `set item status for ${orderId}`,
    );
  }
}

async function seedOperationalDemo(client) {
  const tables = assertResult(await client.from("tables").select("id,table_number,qr_token"), "read tables");
  const products = assertResult(await client.from("products").select("id,name").eq("is_active", true).order("name"), "read products");
  if (tables.length < 12 || products.length < 8) throw new Error("Base seed is missing. Run `npm run db:reset` first.");
  const table = (number) => tables.find((candidate) => candidate.table_number === number);
  const product = (index) => products[index % products.length];
  const orderIds = [];
  const serviceRequestIds = [];

  const dineIn = async (tableNumber, items, notes) => {
    const selected = table(tableNumber);
    const order = await createOrder(client, {
      order_type: "dine_in", source: "qr", table_id: selected.id, table_token: selected.qr_token,
      customer_name: `[DEMO] Mesa ${tableNumber}`, notes, items,
    });
    orderIds.push(order.id);
    return order;
  };
  const offsite = async (type, phone, name, items, extra = {}) => {
    const order = await createOrder(client, {
      order_type: type, source: extra.source || "web", customer_phone: phone,
      customer_name: `[DEMO] ${name}`, notes: extra.notes || `[DEMO] Pedido ${type}`,
      items, payment_method: extra.payment_method || "pix",
      ...(extra.address ? { delivery_address: extra.address } : {}),
      ...(extra.cash_change_for ? { cash_change_for: extra.cash_change_for } : {}),
    });
    orderIds.push(order.id);
    return order;
  };

  const mesa3 = await dineIn(3, [item(product(0)), item(product(1)), item(product(2)), item(product(3))], "[DEMO] Mesa com itens em todas as etapas");
  await setOrder(client, mesa3.id, { status: "open", confirmed_at: new Date().toISOString() });
  await setItemStatuses(client, mesa3.id, ["pending", "preparing", "ready", "delivered"]);

  const mesa5 = await dineIn(5, [item(product(4)), item(product(5))], "[DEMO] Mesa aguardando fechamento");
  await setOrder(client, mesa5.id, { status: "open", confirmed_at: new Date().toISOString() });
  await setItemStatuses(client, mesa5.id, ["delivered"]);
  assertResult(await client.from("tables").update({ status: "closing" }).eq("id", table(5).id), "close table 5");

  await dineIn(8, [item(product(6)), item(product(7))], "[DEMO] Pedido QR aguardando confirmação");
  const requestId = assertResult(
    await client.rpc("create_table_service_request", { p_token: table(4).qr_token, p_type: "waiter" }),
    "create demo waiter request",
  );
  serviceRequestIds.push(requestId);

  await offsite("pickup", DEMO_PHONES[0], "Maria Souza", [item(product(1)), item(product(7))], { notes: "[DEMO] Retirada aguardando confirmação" });
  const mariaOpen = await offsite("pickup", DEMO_PHONES[0], "Maria Souza", [item(product(2)), item(product(8))], { notes: "[DEMO] Retirada em preparo" });
  await setOrder(client, mariaOpen.id, { status: "open", confirmed_at: new Date().toISOString() });
  await setItemStatuses(client, mariaOpen.id, ["preparing"]);
  const mariaReady = await offsite("pickup", DEMO_PHONES[0], "Maria Souza", [item(product(3)), item(product(9))], { notes: "[DEMO] Retirada pronta" });
  await setOrder(client, mariaReady.id, { status: "open", confirmed_at: new Date().toISOString() });
  await setItemStatuses(client, mariaReady.id, ["ready"]);

  const address1 = { street: "Rua das Flores", number: "120", complement: "Apto 12", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001000", reference: "Portaria azul" };
  const address2 = { street: "Avenida Brasil", number: "950", complement: "Casa 2", neighborhood: "Jardins", city: "São Paulo", state: "SP", zip_code: "01430001", reference: "Próximo à praça" };
  await offsite("delivery", DEMO_PHONES[1], "João Lima", [item(product(10)), item(product(11))], { source: "whatsapp", address: address1, notes: "[DEMO] Entrega WhatsApp aguardando confirmação" });
  const delivery = await offsite("delivery", DEMO_PHONES[1], "João Lima", [item(product(12)), item(product(13))], { address: address2, payment_method: "cash", cash_change_for: 100, notes: "[DEMO] Entrega em rota — troco para R$ 100" });
  await setOrder(client, delivery.id, { status: "open", confirmed_at: new Date().toISOString() });
  await setItemStatuses(client, delivery.id, ["ready"]);
  await setOrder(client, delivery.id, { status: "out_for_delivery" });

  const maria = assertResult(await client.from("customers").select("id").eq("phone", DEMO_PHONES[0]).single(), "read Maria");
  const mariaAddress = { customer_id: maria.id, label: "[DEMO] Casa", street: "Rua Harmonia", number: "55", neighborhood: "Vila Madalena", city: "São Paulo", state: "SP", zip_code: "05435000" };
  assertResult(await client.from("customer_addresses").insert(mariaAddress), "seed Maria address");

  for (let index = 0; index < 6; index += 1) {
    const history = await offsite(index % 2 ? "delivery" : "pickup", index % 2 ? DEMO_PHONES[1] : DEMO_PHONES[0], index % 2 ? "João Lima" : "Maria Souza", [item(product(index + 3), 1 + (index % 2))], {
      address: index % 2 ? address1 : undefined,
      payment_method: ["cash", "card", "pix"][index % 3],
      notes: `[DEMO] Histórico ${index + 1}`,
    });
    const closedAt = new Date(Date.now() - (index + 1) * 86_400_000).toISOString();
    await setItemStatuses(client, history.id, ["delivered"]);
    await setOrder(client, history.id, { status: "closed", payment_status: "paid", payment_method: ["cash", "card", "pix"][index % 3], confirmed_at: closedAt, closed_at: closedAt, created_at: closedAt });
  }

  assertResult(await client.from("whatsapp_conversations").upsert([
    { phone: DEMO_PHONES[0], state: "selecting_items", context: { demo: true, cart: [] }, needs_human: false },
    { phone: DEMO_PHONES[1], state: "human_handoff", context: { demo: true }, needs_human: true },
  ]), "seed WhatsApp conversations");

  return { orderIds, serviceRequestIds, customerPhones: DEMO_PHONES };
}

async function main() {
  const { client, password } = demoClient();
  await clearDemo();
  const userIds = await seedStaff(client, password);
  if (process.argv.includes("--staff-only")) {
    writeManifest({ userIds, staffOnly: true, createdAt: new Date().toISOString() });
    console.log("Demo staff accounts created; operational demo data skipped.");
    return;
  }
  const manifest = await seedOperationalDemo(client);
  writeManifest({ ...manifest, userIds, createdAt: new Date().toISOString() });
  console.log("Demo staff, customers, orders, requests, and WhatsApp conversations created.");
}

await main();
