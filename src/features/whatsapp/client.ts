import "server-only";

import { messagePayload } from "./protocol";
import type { Reply } from "./types";

export async function sendWhatsApp(phone: string, reply: Reply): Promise<string> {
  const payload = messagePayload(phone, reply);
  if (process.env.WHATSAPP_MOCK === "true") {
    if (process.env.NODE_ENV !== "development") throw new Error("WhatsApp mock is only allowed in development");
    console.info("[WhatsApp mock]", JSON.stringify(payload));
    return `mock:${crypto.randomUUID()}`;
  }
  const version = process.env.WHATSAPP_API_VERSION;
  const number = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!version || !/^v\d+\.\d+$/.test(version) || !number || !/^\d+$/.test(number) || !token) throw new Error("WhatsApp API configuration missing");
  const response = await fetch(`https://graph.facebook.com/${version}/${number}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`WhatsApp API request failed: ${response.status}`);
  const data: { messages?: { id?: string }[] } = await response.json();
  if (!data.messages?.[0]?.id) throw new Error("WhatsApp message ID missing");
  return data.messages[0].id;
}

export const sendText = (phone: string, body: string) => sendWhatsApp(phone, { kind: "text", body });
export const sendButtons = (phone: string, body: string, buttons: Extract<Reply, { kind: "buttons" }>["buttons"]) => sendWhatsApp(phone, { kind: "buttons", body, buttons });
export const sendList = (phone: string, body: string, rows: Extract<Reply, { kind: "list" }>["rows"]) => sendWhatsApp(phone, { kind: "list", body, rows });
export const sendTemplate = (phone: string, name: string, parameters: string[]) => sendWhatsApp(phone, { kind: "template", name, parameters });
