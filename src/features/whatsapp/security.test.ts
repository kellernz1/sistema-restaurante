import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { assertReply, messagePayload, webhookSchema } from "./protocol";
import { mockAllowed, secretMatches, verifySignature } from "./security";
import { notificationMessage } from "./messages.pt-BR";

describe("webhook security", () => {
  it("verifies exact raw bytes and rejects tampering, missing secrets and malformed signatures", () => {
    const raw = Buffer.from('{"message":"olá"}'); const secret = "test-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifySignature(raw, signature, secret)).toBe(true);
    expect(verifySignature(Buffer.from("{}"), signature, secret)).toBe(false);
    for (const value of [null, "", "sha256=ff", "x".repeat(64)]) expect(verifySignature(raw, value, secret)).toBe(false);
    expect(verifySignature(raw, signature, undefined)).toBe(false);
    expect(secretMatches("test", "test")).toBe(true); expect(secretMatches("", "")).toBe(false);
  });
  it("forbids simulator in production and without an explicit mock flag", () => {
    expect(mockAllowed("development", "true")).toBe(true);
    for (const environment of ["production", "test", undefined]) expect(mockAllowed(environment, "true")).toBe(false);
    expect(mockAllowed("development", "false")).toBe(false);
  });
  it("validates messages, click events, location and delivery callbacks", () => {
    const payload = { object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, messages: [{ id: "wamid.1", from: "5511999999999", timestamp: "1792756800", interactive: { button_reply: { id: "pickup" } } }], statuses: [{ id: "wamid.2", recipient_id: "5511999999999", status: "read" }] } }] }] };
    expect(webhookSchema.safeParse(payload).success).toBe(true);
    expect(webhookSchema.safeParse({ ...payload, object: "other" }).success).toBe(false);
  });
});
describe("Cloud API serialization", () => {
  it("uses free text only inside the 24-hour window", () => {
    const now = Date.now();
    expect(notificationMessage("accepted", 1, null, "https://example.com", now - 86399999, now).kind).toBe("text");
    expect(notificationMessage("accepted", 1, null, "https://example.com", now - 86400000, now).kind).toBe("template");
  });
  it("selects approved templates for every event and preserves rejection reason", () => {
    for (const event of ["accepted", "rejected", "ready", "out_for_delivery", "completed"] as const) {
      const reply = notificationMessage(event, 10, "Produto indisponível", "https://example.com", 0, 90000000);
      assertReply(reply); expect(reply.kind).toBe("template");
      if (reply.kind === "template") expect(reply.parameters).toHaveLength(event === "rejected" ? 3 : 2);
    }
  });
  it("uses the official interactive button and list shapes", () => {
    const payload = messagePayload("+5511999999999", { kind: "buttons", body: "Escolha", buttons: [{ id: "pix", title: "Pix" }] });
    expect(payload).toMatchObject({ messaging_product: "whatsapp", to: "5511999999999", type: "interactive", interactive: { type: "button" } });
    expect(messagePayload("+5511999999999", { kind: "template", name: "order_ready", parameters: ["1", "https://example.com"] })).toMatchObject({ type: "template", template: { language: { code: "pt_BR" } } });
  });
  it("rejects excess buttons, rows, titles, descriptions, and bodies", () => {
    expect(() => assertReply({ kind: "buttons", body: "x", buttons: Array(4).fill({ id: "1", title: "x" }) })).toThrow();
    expect(() => assertReply({ kind: "list", body: "x", rows: Array(11).fill({ id: "1", title: "x" }) })).toThrow();
    expect(() => assertReply({ kind: "list", body: "x", rows: [{ id: "1", title: "x".repeat(25) }] })).toThrow();
    expect(() => assertReply({ kind: "list", body: "x", rows: [{ id: "1", title: "x", description: "x".repeat(73) }] })).toThrow();
    expect(() => assertReply({ kind: "text", body: "x".repeat(1025) })).toThrow();
  });
});
