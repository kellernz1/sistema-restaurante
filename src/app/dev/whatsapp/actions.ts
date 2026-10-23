"use server";

import { z } from "zod";

import { mockAllowed } from "@/features/whatsapp/security";

const inputSchema = z.strictObject({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  text: z.string().min(1).max(4096),
  messageId: z.string().min(1).max(400),
});

export type SimulatorReply =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; body: string; rows: { id: string; title: string; description?: string }[] }
  | { kind: "template"; name: string; parameters: string[] };

export async function sendSimulatorMessage(input: unknown): Promise<{ replies: SimulatorReply[] }> {
  if (!mockAllowed(process.env.NODE_ENV, process.env.WHATSAPP_MOCK, process.env.APP_MODE)) {
    throw new Error("Simulador indisponível.");
  }
  const parsed = inputSchema.parse(input);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.WHATSAPP_WORKER_SECRET;
  if (!baseUrl || !secret) throw new Error("Ambiente local incompleto. Execute npm run local:env.");

  const response = await fetch(new URL("/api/whatsapp/simulate", baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ phone: parsed.phone, text: parsed.text, message_id: parsed.messageId }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Não foi possível processar a mensagem simulada.");
  const body = await response.json() as { replies?: { payload?: SimulatorReply }[] };
  return { replies: (body.replies ?? []).flatMap((row) => row.payload ? [row.payload] : []) };
}
