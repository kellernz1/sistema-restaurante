import type { UserRole } from "@/lib/auth";

export type Employee = {
  id: string; full_name: string | null; email: string; role: UserRole;
  is_active: boolean; created_at: string;
};
