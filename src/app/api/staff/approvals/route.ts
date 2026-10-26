import { requireStaff } from "@/lib/staff-api";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { sensitiveRequestSchema } from "@/features/approvals/validation";

export async function GET() {
  try {
    const { db } = await requireStaff(["admin", "supervisor", "cashier", "waiter"]);
    const result = await db.rpc("security_configuration");
    if (result.error) throw result.error;
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
export async function POST(request: Request) {
  try {
    const { db } = await requireStaff(["admin", "supervisor", "cashier", "waiter"]);
    const parsed = sensitiveRequestSchema.safeParse(await readPublicBody(request));
    if (!parsed.success) throw new PublicApiError(400, "Confira os dados da operação.");
    const p = parsed.data;
    const result = p.command === "quote" ? await db.rpc("sensitive_quote", { p_operation: p.operation })
      : p.command === "approve" ? await db.rpc("request_operation_approval", { p_request_id: p.request, p_approver: p.approver, p_pin: p.pin, p_operation: p.operation, p_binding: p.binding })
      : p.command === "pin" ? await db.rpc("set_approval_pin", { p_pin: p.pin, p_password: p.password })
      : await db.rpc("execute_sensitive_action", { p_request_id: p.request, p_operation: p.operation, p_binding: p.binding, p_authorization: p.authorization ?? undefined });
    // Never log bodies or database errors from PIN/password requests.
    if (result.error) {
      if (/^(?:[0-9A-Z]{5})$/.test(result.error.code ?? "")) throw new PublicApiError(409, "Operação recusada. Atualize o pedido e confira a aprovação. Pedidos pagos precisam de estorno.");
      throw result.error;
    }
    return publicJson(result.data);
  } catch (error) { return publicError(error); }
}
