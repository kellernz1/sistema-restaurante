import "server-only";

import { PublicApiError } from "@/lib/public-table-api";
import { createClient } from "@/utils/supabase/server";

export async function requireStaff(roles: string[]) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new PublicApiError(401, "Entre na sua conta para continuar.");
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !roles.includes(profile.role)) throw new PublicApiError(403, "Seu acesso não permite esta ação.");
  return { db, role: profile.role };
}
