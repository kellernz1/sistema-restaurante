import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database.types";

import { getPublicSupabaseKey } from "./public-env";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getPublicSupabaseKey(),
  );
}
