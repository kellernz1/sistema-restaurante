import { SettingsForm } from "@/features/settings/settings-form";
import { SettingsNavigation } from "@/features/settings/settings-navigation";
import { requireStaff } from "@/lib/staff-api";

export default async function SettingsPage() {
  const { db } = await requireStaff(["admin"]);
  const { data, error } = await db.from("restaurant_settings").select("*").eq("id", true).single();
  if (error || !data) return <p role="alert">Não foi possível carregar as configurações. Confira o seed do banco e atualize a página.</p>;
  return <div className="settings-stack"><SettingsNavigation active="restaurant" /><SettingsForm initial={data} /></div>;
}
