import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database.types";

import { browserSupabaseConnection, getPublicSupabaseKey } from "./public-env";

export function createClient() {
  const connection = browserSupabaseConnection(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    typeof window !== "undefined" ? window.location.origin : undefined,
    typeof document !== "undefined" && document.cookie.split("; ").includes("mesa-certa-staff-preview=1"),
  );
  return createBrowserClient<Database>(
    connection.url,
    getPublicSupabaseKey(),
    { cookieOptions: { name: connection.storageKey, ...(connection.preview ? { secure: true } : {}) } },
  );
}
