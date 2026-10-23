import { z } from "zod";

import type { Reply } from "./types";
import { text } from "./messages.pt-BR";

const message = z.object({
  id: z.string().min(1).max(512), from: z.string().regex(/^[1-9]\d{7,14}$/), timestamp: z.string().regex(/^\d{1,12}$/),
  text: z.object({ body: z.string().max(4096) }).optional(),
  interactive: z.object({ button_reply: z.object({ id: z.string().max(256) }).optional(), list_reply: z.object({ id: z.string().max(256) }).optional() }).optional(),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
});
export const webhookSchema = z.object({ object: z.literal("whatsapp_business_account"), entry: z.array(z.object({ changes: z.array(z.object({ value: z.object({
  metadata: z.object({ phone_number_id: z.string() }),
  messages: z.array(message).max(100).optional(),
  statuses: z.array(z.object({ id: z.string().max(512), recipient_id: z.string().regex(/^[1-9]\d{7,14}$/), status: z.enum(["sent", "delivered", "read", "failed"]) })).max(100).optional(),
}) })).max(100) })).max(10) });

export function assertReply(reply: Reply) {
  if (reply.kind === "text" && reply.fallback_template) assertReply({ kind: "template", ...reply.fallback_template });
  if (reply.kind === "template") { if (!/^[a-z0-9_]+$/.test(reply.name) || reply.parameters.some((value) => value.length > 1024 || !value)) throw new Error("Invalid template"); return; }
  if (!reply.body || reply.body.length > 1024) throw new Error("Invalid message body");
  if (reply.kind === "buttons" && (!reply.buttons.length || reply.buttons.length > 3 || reply.buttons.some((button) => !button.title || button.title.length > 20 || button.id.length > 256))) throw new Error("Invalid reply buttons");
  if (reply.kind === "list" && (!reply.rows.length || reply.rows.length > 10 || reply.rows.some((row) => !row.title || row.title.length > 24 || (row.description?.length ?? 0) > 72 || row.id.length > 200))) throw new Error("Invalid list");
}

export function messagePayload(phone: string, reply: Reply) {
  assertReply(reply);
  const base = { messaging_product: "whatsapp", to: phone.replace(/^\+/, "") };
  if (reply.kind === "text") return { ...base, type: "text", text: { body: reply.body, preview_url: false } };
  if (reply.kind === "template") return { ...base, type: "template", template: { name: reply.name, language: { code: "pt_BR" }, components: [{ type: "body", parameters: reply.parameters.map((value) => ({ type: "text", text: value })) }] } };
  return { ...base, type: "interactive", interactive: {
    type: reply.kind === "buttons" ? "button" : "list", body: { text: reply.body },
    action: reply.kind === "buttons" ? { buttons: reply.buttons.map((button) => ({ type: "reply", reply: button })) } : { button: text.choose, sections: [{ rows: reply.rows }] },
  } };
}
