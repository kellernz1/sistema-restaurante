import "server-only";

import { createHmac } from "node:crypto";

import { tableTokenSchema } from "@/features/customer-ordering/validation";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSecretSupabaseKey } from "@/utils/supabase/private-env";

export class PublicApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function publicJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...(status === 429 ? { "Retry-After": "600" } : {}) } });
}

export function publicError(error: unknown) {
  if(["L0001","L0002"].includes((error as {code?:string})?.code??""))return publicJson({error:"Pedidos temporariamente indisponíveis. Fale com o atendimento."},503);
  return error instanceof PublicApiError
    ? publicJson({ error: error.message }, error.status)
    : publicJson({ error: "Não foi possível concluir. Confira os dados e tente novamente." }, 503);
}

export async function publicQuota(request: Request, scope: string, limit: number, identity?: string) {
  const ip = process.env.PUBLIC_TRUST_PROXY === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "shared";
  const hash = createHmac("sha256", getSecretSupabaseKey()).update(identity ?? ip).digest("hex");
  const { data, error } = await createAdminClient().rpc("consume_public_rate_limit", { p_key: `${scope}:${hash}`, p_limit: limit, p_window_seconds: 600 });
  if (error) throw error;
  if (!data) throw new PublicApiError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
}

export async function publicLimit(request: Request, token: string, mutation: boolean) {
  if (!tableTokenSchema.safeParse(token).success) throw new PublicApiError(404, "QR inválido ou desatualizado. Chame o atendente.");
  const db = createAdminClient();
  // Only trust forwarding headers when the deployment proxy overwrites them.
  const ip = process.env.PUBLIC_TRUST_PROXY === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "shared";
  const digest = (value: string) => createHmac("sha256", getSecretSupabaseKey()).update(value).digest("hex");
  const scope = mutation ? "write" : "read";
  for (const [key, limit] of [[`ip:${digest(ip)}`, mutation ? 60 : 1800], [`table:${digest(token)}`, mutation ? 20 : 6000]] as const) {
    const { data, error } = await db.rpc("consume_public_rate_limit", { p_key: `${scope}:${key}`, p_limit: limit, p_window_seconds: 600 });
    if (error) throw error;
    if (!data) throw new PublicApiError(429, "Muitas tentativas. Aguarde alguns minutos ou chame o atendente.");
  }
}

export async function resolvePublicTable(token: string) {
  const db = createAdminClient();
  const [{ data: table, error }, { data: settings, error: settingsError }] = await Promise.all([
    db.from("tables").select("id, table_number, status").eq("qr_token", token).maybeSingle(),
    db.from("restaurant_settings").select("is_accepting_orders, dine_in_qr_enabled").eq("id", true).single(),
  ]);
  if (error || settingsError) throw error ?? settingsError;
  if (!table) throw new PublicApiError(404, "QR inválido ou desatualizado. Chame o atendente.");
  if (!settings?.dine_in_qr_enabled) throw new PublicApiError(403, "Pedidos pela mesa estão indisponíveis. Chame o atendente.");
  return { table, settings };
}

export async function readPublicBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new PublicApiError(415, "Envie os dados em JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new PublicApiError(400, "Dados inválidos.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new PublicApiError(413, "Pedido muito grande."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new PublicApiError(400, "Dados inválidos."); }
}

export type PublicTableContext = { params: Promise<{ token: string }> };
