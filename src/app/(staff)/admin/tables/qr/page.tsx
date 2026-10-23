import Link from "next/link";

import { QrSheet } from "@/features/tables/qr-sheet";
import { createClient } from "@/utils/supabase/server";

export default async function TableQrPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: profile } = user ? await db.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  if (profile?.role !== "admin") return <p>Acesso exclusivo da administração.</p>;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  let validUrl = false;
  try { validUrl = !!appUrl && ["http:", "https:"].includes(new URL(appUrl).protocol); } catch { /* Invalid configuration is shown below. */ }
  if (!validUrl || !appUrl) return <p>Configure NEXT_PUBLIC_APP_URL com o endereço público do restaurante antes de gerar os códigos.</p>;
  const { data, error } = await db.from("tables").select("id, table_number, qr_token").order("table_number");
  if (error) return <p role="alert">Não foi possível carregar as mesas. Atualize a página.</p>;
  return <><Link href="/admin" className="back-link qr-screen-only">← Administração</Link><QrSheet initialTables={data} appUrl={new URL(appUrl).origin} /></>;
}
