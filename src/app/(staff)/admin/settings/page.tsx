import { getTranslation } from "@/lib/i18n/server";
import { SettingsForm } from "@/features/settings/settings-form";
import { requireStaff } from "@/lib/staff-api";

export default async function SettingsPage() {
  const t = await getTranslation();
  const { db } = await requireStaff(["admin"]);
  const { data, error } = await db.from("restaurant_settings").select("*").eq("id", true).single();
  if (error || !data) return <p role="alert">{t("Não foi possível carregar as configurações. Confira o seed do banco e atualize a página.")}</p>;
  return <div className="settings-stack"><SettingsForm initial={data} /></div>;
}
