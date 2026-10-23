import type { ReactNode } from "react";

import { AuthProvider } from "@/features/auth/auth-provider";

export default function UnauthorizedLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
