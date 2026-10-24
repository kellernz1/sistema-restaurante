export function getPublicSupabaseKey() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error("Missing public Supabase API key.");
  }

  return key;
}

export function browserSupabaseConnection(originalUrl: string, browserOrigin?: string, previewEnabled = false) {
  const storageKey = `sb-${new URL(originalUrl).hostname.split(".")[0]}-auth-token`;
  if (browserOrigin && previewEnabled && new URL(browserOrigin).hostname.endsWith(".trycloudflare.com")) {
    return { url: `${new URL(browserOrigin).origin}/__staff_supabase`, storageKey, preview: true };
  }
  return { url: originalUrl, storageKey, preview: false };
}
