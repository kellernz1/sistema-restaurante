import { z } from "zod";

import { drainWhatsApp, enqueueInput } from "@/features/whatsapp/handlers";
import { mockAllowed, secretMatches } from "@/features/whatsapp/security";
import { publicJson, readPublicBody } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

const schema = z.strictObject({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/), message_id: z.string().min(1).max(400).optional(), text: z.string().max(4096).default(""), location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional() });
export async function POST(request: Request) {
  if (!mockAllowed(process.env.NODE_ENV, process.env.WHATSAPP_MOCK)) return publicJson({ error: "Not found" }, 404);
  if (!secretMatches(request.headers.get("authorization"), process.env.WHATSAPP_WORKER_SECRET ? `Bearer ${process.env.WHATSAPP_WORKER_SECRET}` : undefined)) return publicJson({ error: "Forbidden" }, 403);
  try {
    const input = schema.safeParse(await readPublicBody(request));
    if (!input.success) return publicJson({ error: "Invalid simulation input" }, 400);
    const id = await enqueueInput(`simulate:${input.data.message_id ?? crypto.randomUUID()}`, input.data.phone, { text: input.data.text, location: input.data.location }, new Date().toISOString());
    await drainWhatsApp(60);
    const replies = id ? await createAdminClient().from("whatsapp_messages").select("payload, status").like("wa_message_id", `reply:${id}:%`).order("sequence") : null;
    return publicJson({ duplicate: !id, replies: replies?.data ?? [] });
  } catch { return publicJson({ error: "Simulation unavailable; check database setup" }, 503); }
}
