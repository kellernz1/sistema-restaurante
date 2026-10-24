import { describe, expect, it } from "vitest";

import { assertReply } from "./protocol";
import { transitionToMenuLink } from "./state-machine";
import type { Environment, Session } from "./types";

const env: Environment = {
  now: Date.now(), appUrl: "https://restaurant.example",
  settings: { is_accepting_orders: true, whatsapp_enabled: true, pickup_enabled: true, delivery_enabled: true, dine_in_qr_enabled: true, delivery_fee: 5, min_delivery_order: 20, estimated_pickup_minutes: 30, estimated_delivery_minutes: 50 },
  categories: [], products: [], addresses: [],
  tables: [{ id: "table", table_number: 2, qr_token: "a".repeat(64), status: "available" }],
};
const session: Session = { state: "welcome", context: { cart: [] }, needs_human: false, opted_out: false, last_message_at: new Date(env.now).toISOString() };
const send = (text: string, previous = session, environment = env) => transitionToMenuLink(previous, { text }, environment);

describe("WhatsApp directs customers to the web menu", () => {
  it("sends a link without conversational options or submitting an old cart", () => {
    for (const input of ["oi", "menu", "confirm", "pickup"]) {
      const result = send(input, { ...session, state: "confirm", context: { cart: [{ product_id: "old", quantity: 1, notes: "" }] } });
      expect(result.submit).toBeUndefined();
      expect(result.session.context.cart).toEqual([]);
      expect(result.replies).toHaveLength(1);
      result.replies.forEach(assertReply);
      expect(result.replies[0]).toMatchObject({ kind: "text", body: expect.stringContaining("https://restaurant.example/order") });
    }
  });
  it("uses only a valid enabled table token for a table link", () => {
    expect(send(`MESA-${env.tables[0].qr_token}`).replies[0]).toMatchObject({ body: expect.stringContaining(`/t/${env.tables[0].qr_token}`) });
    expect(JSON.stringify(send("MESA-invalid").replies)).not.toContain("/t/");
    expect(JSON.stringify(send(`MESA-${env.tables[0].qr_token}`, session, { ...env, settings: { ...env.settings, dine_in_qr_enabled: false } }).replies)).not.toContain("/t/");
  });
  it("preserves human handoff, opt-out and closed settings", () => {
    expect(send("menu", { ...session, needs_human: true }).replies).toEqual([]);
    expect(send("oi", { ...session, opted_out: true }).replies).toEqual([]);
    expect(send("menu", { ...session, opted_out: true }).session.opted_out).toBe(false);
    expect(send("atendente").session.needs_human).toBe(true);
    expect(send("parar").session.opted_out).toBe(true);
    expect(JSON.stringify(send("oi", session, { ...env, settings: { ...env.settings, is_accepting_orders: false } }).replies)).not.toContain("/order");
  });
});
