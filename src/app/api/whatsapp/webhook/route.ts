import { after } from "next/server";
import { ZodError } from "zod";

import { checkWhatsAppMode, drainWhatsApp, ingestWebhook } from "@/features/whatsapp/handlers";
import { secretMatches, verifySignature } from "@/features/whatsapp/security";
import { publicJson } from "@/lib/public-table-api";

export const maxDuration = 60;
export async function GET(request: Request) {
  try { checkWhatsAppMode(); } catch { return new Response("Mock mode forbidden", { status: 503 }); }
  const query = new URL(request.url).searchParams;
  if (query.get("hub.mode") !== "subscribe" || !secretMatches(query.get("hub.verify_token"), process.env.WHATSAPP_VERIFY_TOKEN)) return new Response("Forbidden", { status: 403 });
  const challenge = query.get("hub.challenge");
  if (!challenge || challenge.length > 1000) return new Response("Invalid challenge", { status: 400 });
  return new Response(challenge, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  try {
    checkWhatsAppMode();
    const reader = request.body?.getReader();
    if (!reader) return publicJson({ error: "Invalid body" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1048576) { await reader.cancel(); return publicJson({ error: "Payload too large" }, 413); } chunks.push(value); }
    const raw = Buffer.concat(chunks);
    if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) return publicJson({ error: "Invalid signature" }, 401);
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID) return publicJson({ error: "Webhook not configured" }, 503);
    let body: unknown;
    try { body = JSON.parse(raw.toString("utf8")); } catch { return publicJson({ error: "Invalid JSON" }, 400); }
    await ingestWebhook(body);
    after(async () => { try { await drainWhatsApp(); } catch { console.error("WhatsApp background worker failed"); } });
    return publicJson({ received: true });
  } catch (error) { return publicJson({ error: error instanceof ZodError ? "Invalid webhook payload" : "Webhook temporarily unavailable" }, error instanceof ZodError ? 400 : 503); }
}
