import "server-only";

import type { Json } from "@/types/database.types";
import { createAdminClient } from "@/utils/supabase/admin";
import {licensingError}from "@/lib/licensing";

// All public channels share the database's transactional validation and pricing.
export async function createCustomerOrder(payload: Json) {
  const { data, error } = await createAdminClient().rpc("create_customer_order", { p_payload: payload });
  if (error || !data) throw licensingError(error)??error??new Error("No order returned");
  return data;
}

// Cashier creation reuses customer pricing inside one idempotent DB transaction.
export async function createCashierOrder(actorId: string, requestId: string, payload: Json) {
  const { data, error } = await createAdminClient().rpc("create_cashier_order", {
    p_actor_id: actorId, p_request_id: requestId, p_payload: payload,
  });
  if (error || !data) throw licensingError(error)??error??new Error("No order returned");
  return data;
}

// Order creation, conversation state and reply outbox commit in one DB transaction.
export async function commitWhatsAppTurn(messageId: string, lease: string, session: Json, replies: Json, order?: Json) {
  const { data, error } = await createAdminClient().rpc("commit_whatsapp_turn", { p_message_id: messageId, p_lease: lease, p_session: session, p_replies: replies, p_order: order });
  if (error) throw error;
  return data;
}
