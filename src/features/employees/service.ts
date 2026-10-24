import "server-only";

import type { Employee } from "@/features/employees/types";
import { PublicApiError } from "@/lib/public-table-api";
import { createAdminClient } from "@/utils/supabase/admin";

// Auth data never leaves the server except for this explicit employee projection.
export async function listEmployees(): Promise<Employee[]> {
  const admin = createAdminClient();
  const emails = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new PublicApiError(503, "Não foi possível consultar as contas.");
    for (const user of data.users) emails.set(user.id, user.email ?? "");
    if (data.users.length < 1000) break;
  }
  const employees: Employee[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from("profiles").select("id, full_name, role, is_active, created_at").order("created_at").order("id").range(offset, offset + 999);
    if (error) throw new PublicApiError(503, "Não foi possível consultar os funcionários.");
    employees.push(...data.map((profile) => ({ ...profile, email: emails.get(profile.id) ?? "" })));
    if (data.length < 1000) return employees;
  }
}
