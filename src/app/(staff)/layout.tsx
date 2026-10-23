import type { ReactNode } from "react";

import { StaffShell } from "@/features/auth/staff-shell";
import { AuthProvider } from "@/features/auth/auth-provider";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <AuthProvider><StaffShell>{children}</StaffShell></AuthProvider>;
}
