import { SettingsForm } from "@/features/settings/settings-form";
import { requireStaff } from "@/lib/staff-api";

export default async function SettingsPage() {
  const { db } = await requireStaff(["admin"]);
  const { data, error } = await db.from("restaurant_settings").select("*").eq("id", true).single();
  if (error || !data) return <p role="alert">Não foi possível carregar as configurações. Confira o seed do banco e atualize a página.</p>;
  return <SettingsForm initial={data} />;
}
