import "server-only";

export function getSecretSupabaseKey() {
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Missing server-only Supabase API key.");
  }

  return key;
}
