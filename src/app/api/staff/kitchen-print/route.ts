import { z } from "zod";

import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";

const inputSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("claim"), terminal_id: z.uuid() }),
  z.strictObject({ action: z.literal("release"), terminal_id: z.uuid() }),
  z.strictObject({ action: z.literal("finish"), terminal_id: z.uuid(), job_id: z.uuid(), claim_token: z.uuid(), error: z.string().max(300).optional() }),
  z.strictObject({ action: z.literal("manual"), order_id: z.uuid() }),
]);

export async function GET() {
  try {
    const { db } = await requireStaff(["admin", "kitchen", "cashier"]);
    const [jobs, settings, pending] = await Promise.all([
      db.from("kitchen_print_jobs").select("id,order_id,status,error_message,created_at,orders(order_number,order_type,tables(table_number))").order("created_at", { ascending: false }).limit(20),
      db.from("restaurant_settings").select("kitchen_auto_print_enabled").eq("id", true).single(),
      db.from("kitchen_print_jobs").select("id", { head: true, count: "exact" }).in("status", ["pending", "claimed"]),
    ]);
    if (jobs.error || settings.error || pending.error) throw new PublicApiError(503, "Não foi possível consultar a fila de impressão.");
    return publicJson({ jobs: jobs.data, enabled: settings.data.kitchen_auto_print_enabled, pending: pending.count ?? 0 });
  } catch (error) { return publicError(error); }
}

export async function POST(request: Request) {
  try {
    const { db, role } = await requireStaff(["admin", "kitchen", "cashier", "waiter"]);
    const input = inputSchema.safeParse(await readPublicBody(request));
    if (!input.success) throw new PublicApiError(400, "Confira os dados de impressão.");
    const value = input.data;
    if (value.action !== "manual" && !["admin", "kitchen"].includes(role)) throw new PublicApiError(403, "Ative a impressão automática com uma conta da cozinha ou do administrador.");
    if (value.action === "claim") {
      const result = await db.rpc("claim_kitchen_print_job", { p_terminal_id: value.terminal_id });
      if (result.error) throw new PublicApiError(409, "Não foi possível reservar a impressão.");
      return publicJson(result.data);
    }
    const result = value.action === "release" ? await db.rpc("release_kitchen_printer", { p_terminal_id: value.terminal_id })
      : value.action === "manual" ? await db.rpc("mark_manual_kitchen_print", { p_order_id: value.order_id })
      : await db.rpc("finish_kitchen_print_job", { p_job_id: value.job_id, p_terminal_id: value.terminal_id, p_claim_token: value.claim_token, p_error: value.error });
    if (result.error) throw new PublicApiError(409, "A impressão foi alterada ou está em andamento. Confira a fila antes de imprimir novamente.");
    return publicJson({ success: true });
  } catch (error) { return publicError(error); }
}
