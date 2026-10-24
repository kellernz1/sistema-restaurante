import "server-only";

import { after } from "next/server";

import type { StoredRow } from "@/types/records";
import { createAdminClient } from "@/utils/supabase/admin";
import { drainWhatsApp } from "@/features/whatsapp/handlers";
import { notificationMessage } from "@/features/whatsapp/messages.pt-BR";

export type CustomerEvent = "accepted" | "rejected" | "ready" | "out_for_delivery" | "completed";

export async function notifyCustomer(order: StoredRow<"orders">, event: CustomerEvent): Promise<void> {
  if (order.source !== "whatsapp" || !order.customer_phone) return;
  try {
    const db = createAdminClient();
    const conversation = await db.from("whatsapp_conversations").select("last_message_at, opted_out, needs_human").eq("phone", order.customer_phone).single();
    if (conversation.error) throw conversation.error;
    if (conversation.data.opted_out || conversation.data.needs_human) return;
    const link = `${new URL(process.env.NEXT_PUBLIC_APP_URL!).origin}/track/${order.public_token}`;
    const payload = notificationMessage(event, order.order_number, order.cancel_reason, link, Date.parse(conversation.data.last_message_at), Date.now());
    const queued = await db.from("whatsapp_messages").upsert({ wa_message_id: `notify:${order.id}:${event}`, phone: order.customer_phone, direction: "out", payload }, { onConflict: "wa_message_id", ignoreDuplicates: true });
    if (queued.error) throw queued.error;
    after(async () => { try { await drainWhatsApp(); } catch { console.error("WhatsApp notification worker failed"); } });
  } catch { console.error("WhatsApp notification enqueue failed"); }
}
