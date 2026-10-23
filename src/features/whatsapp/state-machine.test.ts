import { describe, expect, it } from "vitest";

import { assertReply } from "./protocol";
import { prompt, transition } from "./state-machine";
import type { Environment, Session } from "./types";

const now = Date.parse("2026-10-23T12:00:00Z");
const env: Environment = {
  now, appUrl: "https://restaurant.example", settings: { is_accepting_orders: true, whatsapp_enabled: true, pickup_enabled: true, delivery_enabled: true, dine_in_qr_enabled: true, delivery_fee: 5, min_delivery_order: 20, estimated_pickup_minutes: 30, estimated_delivery_minutes: 50 },
  categories: [{ id: "c", name: "Pratos" }], products: [{ id: "p", name: "Prato do dia", category_id: "c", price: 12.5 }], tables: [{ id: "t", table_number: 1, qr_token: "a".repeat(64), status: "available" }], addresses: [],
};
const fresh = (): Session => ({ state: "welcome", context: { cart: [] }, needs_human: false, opted_out: false, last_message_at: new Date(now).toISOString() });
function drive(inputs: string[], environment = env, initial = fresh()) {
  let session = initial; let result = transition(session, { text: "" }, environment);
  for (const input of inputs) { result = transition(session, { text: input }, environment); result.replies.forEach(assertReply); session = result.session; }
  return result;
}
const browse = ["category:c", "product:p", "2", "skip", "finish"];

describe("WhatsApp order happy paths", () => {
  it("completes pickup with name, notes, and Pix", () => {
    const result = drive(["oi", "pickup", ...browse, "Ana", "pix", "confirm"]);
    expect(result.submit).toBe(true); expect(result.session.context.order_type).toBe("pickup");
    expect(result.session.context.cart).toEqual([{ product_id: "p", quantity: 2, notes: "" }]);
    expect(result.session.context.payment_method).toBe("pix");
  });
  it("completes delivery collecting a full address and cash change", () => {
    const result = drive(["oi", "delivery", ...browse, "Ana", "new_address", "Rua A", "10", "Centro", "São Paulo", "SP", "01001-000", "pular", "pular", "cash", "50", "confirm"]);
    expect(result.submit).toBe(true); expect(result.session.context.cash_change_for).toBe(50);
    expect(result.session.context.address?.zip_code).toBe("01001000");
  });
  it("completes local ordering by table number", () => {
    const result = drive(["oi", "dine_in", "1", ...browse, "Ana", "card", "confirm"]);
    expect(result.submit).toBe(true); expect(result.session.context.table_id).toBe("t");
    expect(result.session.context.table_token).toBeUndefined();
  });
  it("resolves a table deep link and keeps its capability token", () => {
    const result = drive([`MESA-${"a".repeat(64)}`, ...browse, "Ana", "pix", "confirm"]);
    expect(result.submit).toBe(true); expect(result.session.context.table_token).toBe("a".repeat(64));
  });
  it("reuses a known name and verified-phone saved address", () => {
    const result = drive(["oi", "delivery", ...browse, "address:a", "pix", "confirm"], { ...env, customerName: "Ana", addresses: [{ id: "a", address: { street: "Rua A", number: "1", neighborhood: "Centro", city: "São Paulo", state: "SP", zip_code: "01001000", complement: "", reference: "" } }] });
    expect(result.submit).toBe(true); expect(result.session.context.customer_name).toBe("Ana");
  });
});

describe("validation and global controls", () => {
  it("does not mutate its input session", () => {
    const initial = fresh(); drive(["oi", "pickup", "category:c", "product:p", "1", "sem cebola"], env, initial);
    expect(initial).toEqual(fresh());
  });
  it("supports editing/removing items without submitting an empty cart", () => {
    const initial = drive(["oi", "pickup", ...browse, "Ana", "pix"]);
    const edited = drive(["edit", "remove:0"], env, initial.session);
    expect(edited.session.state).toBe("categories"); expect(edited.session.context.cart).toEqual([]);
    expect(edited.submit).toBeUndefined();
  });
  it("does not submit a second time after confirmation", () => {
    const submitted = drive(["oi", "pickup", ...browse, "Ana", "pix", "confirm"]);
    expect(submitted.submit).toBe(true);
    expect(drive(["confirm"], env, submitted.session).submit).toBeUndefined();
  });
  it("reprompts unknown selections and invalid quantities", () => {
    const quantity: Session = { ...fresh(), state: "quantity", context: { cart: [], product_id: "p" } };
    for (const input of ["0", "-1", "100", "1.5", "nope"]) {
      const result = drive([input], env, quantity); expect(result.session.state).toBe("quantity"); expect(result.replies.length).toBeGreaterThan(1);
    }
  });
  it("clears the cart on cancel or menu", () => {
    const cart: Session = { ...fresh(), state: "cart", context: { cart: [{ product_id: "p", quantity: 1, notes: "" }] } };
    expect(drive(["cancelar"], env, cart).session.context.cart).toEqual([]);
    expect(drive(["menu"], env, cart).session.state).toBe("type");
  });
  it("expires after two hours", () => {
    const result = drive(["anything"], env, { ...fresh(), state: "cart", last_message_at: new Date(now - 7200001).toISOString() });
    expect(result.session.state).toBe("type"); expect(result.replies.some((reply) => reply.kind === "text" && reply.body.includes("expirou"))).toBe(true);
  });
  it("stops all bot answers during human handoff", () => {
    const handoff = drive(["atendente"]); expect(handoff.session.needs_human).toBe(true);
    expect(drive(["menu"], env, handoff.session).replies).toEqual([]);
    expect(drive(["parar"], env, handoff.session).session.opted_out).toBe(true);
  });
  it("respects opt-out until menu", () => {
    const stopped = drive(["parar"]); expect(stopped.session.opted_out).toBe(true);
    expect(drive(["oi"], env, stopped.session).replies).toEqual([]);
    expect(drive(["menu"], env, stopped.session).session.opted_out).toBe(false);
  });
  it("hides disabled types and closes the bot when disabled", () => {
    const limited = { ...env, settings: { ...env.settings, delivery_enabled: false, dine_in_qr_enabled: false } };
    const reply = drive(["oi"], limited).replies[0];
    expect(reply.kind === "buttons" && reply.buttons.map((item) => item.id)).toEqual(["pickup"]);
    expect(drive(["oi"], { ...env, settings: { ...env.settings, whatsapp_enabled: false } }).submit).toBeUndefined();
  });
  it("requires QR or assistance for an already occupied number-only table", () => {
    const result = drive(["oi", "dine_in", "1"], { ...env, tables: [{ ...env.tables[0], status: "occupied" }] });
    expect(result.session.state).toBe("table"); expect(result.session.context.table_id).toBeUndefined();
  });
  it("enforces delivery minimum and sufficient cash", () => {
    const expensive = { ...env, settings: { ...env.settings, min_delivery_order: 100 } };
    expect(drive(["oi", "delivery", ...browse], expensive).session.state).toBe("cart");
    const result = drive(["oi", "pickup", ...browse, "Ana", "cash", "1"]);
    expect(result.session.state).toBe("change"); expect(result.submit).toBeUndefined();
  });
  it("does not submit a product removed from the current catalog", () => {
    const confirm = drive(["oi", "pickup", ...browse, "Ana", "pix"]);
    const result = drive(["confirm"], { ...env, products: [] }, confirm.session);
    expect(result.submit).toBeUndefined(); expect(result.session.state).toBe("confirm");
  });
  it("accepts location while still requiring complete address fields", () => {
    const initial: Session = { ...fresh(), state: "address", context: { cart: [], address_index: 0 } };
    const result = transition(initial, { text: "", location: { latitude: -23.5, longitude: -46.6 } }, env);
    expect(result.session.context.location).toBe("-23.5,-46.6"); expect(result.session.state).toBe("address");
  });
});

describe("platform limits", () => {
  it("paginates large menus without exceeding ten total rows", () => {
    const large = { ...env, products: Array.from({ length: 45 }, (_, index) => ({ id: `p${index}`, category_id: "c", name: "😀".repeat(50), price: 1 })) };
    let session: Session = { ...fresh(), state: "products", context: { cart: [], category_id: "c" } };
    const ids = new Set<string>();
    for (let page = 0; page < 5; page++) {
      const result = drive([`more:products:${page}`], large, session); session = result.session;
      result.replies.forEach(assertReply);
      for (const reply of result.replies) if (reply.kind === "list") reply.rows.filter((row) => row.id.startsWith("product:")).forEach((row) => ids.add(row.id));
    }
    expect(ids.size).toBe(45);
  });
  it("splits a full cart summary into bounded messages", () => {
    const session: Session = { ...fresh(), state: "confirm", context: { order_type: "delivery", cart: Array.from({ length: 20 }, () => ({ product_id: "p", quantity: 99, notes: "x".repeat(200) })) } };
    const replies = prompt(session, env); expect(replies.length).toBeGreaterThan(2); replies.forEach(assertReply);
  });
});
