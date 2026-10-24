import { z } from "zod";

import { employeeUpdateSchema } from "@/features/employees/validation";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function PATCH(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  try {
    const { db, userId } = await requireStaff(["admin"]);
    const id = z.uuid().safeParse((await context.params).employeeId);
    const parsed = employeeUpdateSchema.safeParse(await readPublicBody(request));
    if (!id.success || !parsed.success) throw new PublicApiError(400, "Confira o nome e o perfil de acesso.");
    if (id.data === userId && (("is_active" in parsed.data && !parsed.data.is_active) || ("role" in parsed.data && parsed.data.role !== "admin"))) {
      throw new PublicApiError(409, "Você não pode bloquear sua própria conta nem remover seu perfil de administrador.");
    }
    const admin = createAdminClient();
    const account = await admin.auth.admin.getUserById(id.data);
    if (account.error || !account.data.user) throw new PublicApiError(404, "Funcionário não encontrado.");
    if ("is_active" in parsed.data && parsed.data.is_active) {
      const unbanned = await admin.auth.admin.updateUserById(id.data, { ban_duration: "none" });
      if (unbanned.error) throw new PublicApiError(503, "Não foi possível liberar o login. Tente novamente.");
    }
    const { data, error } = await db.from("profiles").update(parsed.data).eq("id", id.data).select("id, full_name, role, is_active, created_at").maybeSingle();
    if (error || !data) throw new PublicApiError(409, "Não foi possível atualizar. É necessário manter ao menos um administrador ativo.");
    return publicJson({ employee: { ...data, email: account.data.user.email ?? "" } });
  } catch (error) { return publicError(error); }
}
