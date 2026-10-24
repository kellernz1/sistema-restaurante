import { employeeCreateSchema } from "@/features/employees/validation";
import { listEmployees } from "@/features/employees/service";
import { PublicApiError, publicError, publicJson, readPublicBody } from "@/lib/public-table-api";
import { requireStaff } from "@/lib/staff-api";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  try {
    await requireStaff(["admin"]);
    return publicJson({ employees: await listEmployees() });
  } catch (error) { return publicError(error); }
}

export async function POST(request: Request) {
  try {
    const { db } = await requireStaff(["admin"]);
    const parsed = employeeCreateSchema.safeParse(await readPublicBody(request));
    if (!parsed.success) throw new PublicApiError(400, "Confira nome, e-mail, perfil e senha de 8 a 72 caracteres.");
    const { full_name, email, password, role, is_active } = parsed.data;
    const admin = createAdminClient();
    // Keep the account unable to sign in until its intended profile is saved.
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, ban_duration: "876000h", user_metadata: { full_name } });
    if (created.error || !created.data.user) throw new PublicApiError(409, "Não foi possível criar a conta. Confira se o e-mail já está cadastrado e se a senha atende aos requisitos.");
    const id = created.data.user.id;
    let profile = await db.from("profiles").update({ full_name, role, is_active: false }).eq("id", id).select("id, full_name, role, is_active, created_at").single();
    if (profile.error) {
      await admin.from("profiles").update({ is_active: false }).eq("id", id);
      throw new PublicApiError(503, "A conta foi criada sem liberar o login. Atualize a lista, confira o perfil e reative a conta.");
    }
    if (is_active) {
      const enabled = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (enabled.error) {
        throw new PublicApiError(503, "A conta foi criada, mas não foi possível ativá-la. Atualize a lista e tente reativar.");
      }
      profile = await db.from("profiles").update({ is_active: true }).eq("id", id).select("id, full_name, role, is_active, created_at").single();
      if (profile.error) throw new PublicApiError(503, "A conta foi criada. Atualize a lista e confira o acesso antes de tentar novamente.");
    }
    return publicJson({ employee: { ...profile.data, email } }, 201);
  } catch (error) { return publicError(error); }
}
