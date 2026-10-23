import "server-only";

import { addressSchema } from "@/features/customer-ordering/offsite-validation";
import { commitWhatsAppTurn } from "@/lib/order-service";
import type { Json, Tables } from "@/types/database.types";
import { createAdminClient } from "@/utils/supabase/admin";

import { sendWhatsApp } from "./client";
import { text } from "./messages.pt-BR";
import { assertReply, webhookSchema } from "./protocol";
import { prompt, transition } from "./state-machine";
import type { Context, Environment, Input, Reply, Session } from "./types";

const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
type Job = Tables<"whatsapp_messages">;
export function checkWhatsAppMode() {
  if (process.env.NODE_ENV === "production" && process.env.WHATSAPP_MOCK === "true") throw new Error("WhatsApp mock is forbidden in production");
}

export async function enqueueInput(id: string, phone: string, input: Input, receivedAt: string) {
  const db = createAdminClient();
  const conversation = await db.from("whatsapp_conversations").upsert({ phone, last_message_at: receivedAt }, { onConflict: "phone", ignoreDuplicates: true });
  if (conversation.error) throw conversation.error;
  const result = await db.from("whatsapp_messages").upsert({ wa_message_id: id, phone, direction: "in", payload: json({ ...input, received_at: receivedAt }) }, { onConflict: "wa_message_id", ignoreDuplicates: true }).select("id");
  if (result.error) throw result.error;
  return result.data[0]?.id ?? null;
}

export async function ingestWebhook(value: unknown) {
  const parsed = webhookSchema.parse(value);
  const db = createAdminClient();
  const phones = new Map<string, string>();
  const messages = new Map<string, { wa_message_id: string; phone: string; direction: string; payload: Json }>();
  const remember = (phone: string, at: string) => { if (!phones.has(phone) || at < phones.get(phone)!) phones.set(phone, at); };
  for (const entry of parsed.entry) for (const change of entry.changes) {
    if (change.value.metadata.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
    for (const message of change.value.messages ?? []) {
      const timestamp = Math.min(Date.now(), Number(message.timestamp) * 1000);
      const phone = `+${message.from}`; const receivedAt = new Date(timestamp).toISOString();
      remember(phone, receivedAt);
      messages.set(message.id, { wa_message_id: message.id, phone, direction: "in", payload: json({ text: message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id ?? message.text?.body ?? "", ...(message.location ? { location: message.location } : {}), received_at: receivedAt }) });
    }
    for (const event of change.value.statuses ?? []) {
      const phone = `+${event.recipient_id}`;
      remember(phone, new Date().toISOString());
      const id = `status:${event.id}:${event.status}`;
      messages.set(id, { wa_message_id: id, phone, direction: "status", payload: json(event) });
    }
  }
  if (!messages.size) return;
  const created = await db.from("whatsapp_conversations").upsert([...phones].map(([phone, at]) => ({ phone, last_message_at: at })), { onConflict: "phone", ignoreDuplicates: true });
  if (created.error) throw created.error;
  const queued = await db.from("whatsapp_messages").upsert([...messages.values()], { onConflict: "wa_message_id", ignoreDuplicates: true });
  if (queued.error) throw queued.error;
}

async function environment(phone: string): Promise<Environment> {
  const db = createAdminClient();
  const results = await Promise.all([
    db.from("restaurant_settings").select("*").eq("id", true).single(),
    db.from("categories").select("id, name").order("sort_order"),
    db.from("products").select("id, name, category_id, price").eq("is_active", true).order("name"),
    db.from("tables").select("id, table_number, qr_token, status").order("table_number"),
    db.from("customers").select("id, name").eq("phone", phone).maybeSingle(),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [settings, categories, products, tables, customer] = results;
  const saved = customer.data ? await db.from("customer_addresses").select("*").eq("customer_id", customer.data.id).order("created_at", { ascending: false }).limit(100) : null;
  if (saved?.error) throw saved.error;
  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").origin;
  if (appUrl.length > 200) throw new Error("Application URL too long");
  return { now: Date.now(), appUrl, settings: settings.data!, categories: categories.data!, products: products.data!, tables: tables.data!, customerName: customer.data?.name ?? undefined,
    addresses: (saved?.data ?? []).flatMap((row) => { const parsed = addressSchema.safeParse({ street: row.street, number: row.number, complement: row.complement ?? "", neighborhood: row.neighborhood, city: row.city, state: row.state, zip_code: row.zip_code, reference: row.reference ?? "" }); return parsed.success ? [{ id: row.id, address: parsed.data }] : []; }),
  };
}

async function release(job: Job) {
  const result = await createAdminClient().from("whatsapp_conversations").update({ lease_token: null, lease_until: null }).eq("phone", job.phone).eq("lease_token", job.lease_token!);
  if (result.error) throw result.error;
}

async function incoming(job: Job) {
  const db = createAdminClient();
  const conversation = await db.from("whatsapp_conversations").select("*").eq("phone", job.phone).single();
  if (conversation.error) throw conversation.error;
  const row = conversation.data;
  const stored = row.context as unknown as Partial<Context>;
  const session: Session = { state: row.state, context: { ...stored, cart: stored.cart ?? [] }, needs_human: row.needs_human, opted_out: row.opted_out, last_message_at: row.last_message_at };
  const env = await environment(job.phone);
  const result = transition(session, job.payload as unknown as Input, env);
  const commit = async (order?: Json) => {
    result.replies.forEach(assertReply);
    await commitWhatsAppTurn(job.id, job.lease_token!, json({ ...result.session,
      confirmation_text: text.confirmation.replace("{url}", env.appUrl),
      estimated_minutes: result.session.context.order_type === "delivery" ? env.settings.estimated_delivery_minutes : env.settings.estimated_pickup_minutes,
    }), json(result.replies), order);
  };
  if (result.submit) {
    const c = result.session.context;
    try {
      await commit(json({ order_type: c.order_type, items: c.cart, customer_name: c.customer_name, table_id: c.table_id, table_token: c.table_token, delivery_address: c.address, payment_method: c.payment_method, cash_change_for: c.cash_change_for }));
    } catch {
      const current = await db.from("whatsapp_messages").select("status").eq("id", job.id).single();
      if (current.data?.status === "processed") return;
      result.session.state = "confirm";
      result.replies = [{ kind: "text", body: text.failure }, ...prompt(result.session, env)];
      await commit();
    }
  } else await commit();
}

async function outbound(job: Job) {
  const db = createAdminClient();
  const conversation = await db.from("whatsapp_conversations").select("last_message_at, needs_human, opted_out").eq("phone", job.phone).single();
  if (conversation.error) throw conversation.error;
  let reply = job.payload as unknown as Reply;
  const handoff = reply.kind === "text" && reply.handoff;
  const expired = Date.now() - Date.parse(conversation.data.last_message_at) >= 24 * 60 * 60 * 1000;
  if (expired && reply.kind === "text" && reply.fallback_template) reply = { kind: "template", ...reply.fallback_template };
  const skip = (conversation.data.needs_human && !handoff) || (conversation.data.opted_out && !handoff && !(reply.kind === "text" && reply.body === text.optout)) || (reply.kind !== "template" && expired);
  if (skip) {
    await db.from("whatsapp_messages").update({ status: "skipped", lease_until: null }).eq("id", job.id).eq("lease_token", job.lease_token!);
    await release(job); return;
  }
  try {
    const providerId = await sendWhatsApp(job.phone, reply);
    const updated = await db.from("whatsapp_messages").update({ status: "sent", provider_id: providerId, payload: json(reply), lease_until: null }).eq("id", job.id).eq("lease_token", job.lease_token!);
    if (updated.error) throw updated.error;
  } catch {
    // A timed-out API call may have delivered: never automatically resend it.
    await db.from("whatsapp_messages").update({ status: "failed", lease_until: null }).eq("id", job.id).eq("lease_token", job.lease_token!);
    await db.from("whatsapp_conversations").update({ needs_human: true }).eq("phone", job.phone);
    console.error("WhatsApp outbound failed; staff follow-up required");
  }
  await release(job);
}

async function status(job: Job) {
  const db = createAdminClient();
  const event = job.payload as { id: string; status: string };
  const outbound = await db.from("whatsapp_messages").select("id, status").eq("provider_id", event.id).eq("phone", job.phone).maybeSingle();
  if (outbound.error) throw outbound.error;
  const ranks: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 0 };
  if (outbound.data && ((event.status === "failed" && !["delivered", "read"].includes(outbound.data.status)) || (ranks[event.status] ?? 0) > (ranks[outbound.data.status] ?? 0))) {
    const changed = await db.from("whatsapp_messages").update({ status: event.status }).eq("id", outbound.data.id);
    if (changed.error) throw changed.error;
  }
  const finished = await db.from("whatsapp_messages").update({ status: "processed", lease_until: null }).eq("id", job.id).eq("lease_token", job.lease_token!);
  if (finished.error) throw finished.error;
  await release(job);
}

export async function drainWhatsApp(limit = 24) {
  checkWhatsAppMode();
  const db = createAdminClient(); const started = Date.now(); let processed = 0;
  // Expired outbound leases have uncertain delivery and require human review.
  const uncertain = await db.from("whatsapp_messages").select("id, phone").eq("direction", "out").eq("status", "processing").lt("lease_until", new Date().toISOString());
  if (uncertain.error) throw uncertain.error;
  for (const row of uncertain.data) {
    await db.from("whatsapp_messages").update({ status: "failed" }).eq("id", row.id).eq("status", "processing");
    await db.from("whatsapp_conversations").update({ needs_human: true }).eq("phone", row.phone);
  }
  while (processed < limit && Date.now() - started < 40000) {
    let found = false;
    for (const direction of ["in", "out", "status"]) {
      const claimed = await db.rpc("claim_whatsapp_message", { p_direction: direction });
      if (claimed.error) throw claimed.error;
      const job = claimed.data;
      if (!job?.id) continue;
      found = true; processed++;
      try {
        if (direction === "in") await incoming(job);
        else if (direction === "out") await outbound(job);
        else await status(job);
      } catch {
        const failed = direction === "out" || job.attempts >= 3;
        await db.from("whatsapp_messages").update({ status: failed ? "failed" : "pending", lease_until: null }).eq("id", job.id).eq("status", "processing").eq("lease_token", job.lease_token!);
        if (failed) await db.from("whatsapp_conversations").update({ needs_human: true }).eq("phone", job.phone);
        await release(job);
        console.error("WhatsApp queue processing failed");
      }
    }
    if (!found) break;
  }
  return processed;
}
