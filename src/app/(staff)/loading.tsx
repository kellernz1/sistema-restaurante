import { getTranslation } from "@/lib/i18n/server";
import { LoaderCircle } from "lucide-react";

export default async function StaffLoading() {
  const t = await getTranslation();
  return (
    <main className="centered-state" aria-live="polite">
      <LoaderCircle className="spin" aria-hidden="true" size={28} />
      <p>{t("Carregando painel...")}</p>
    </main>
  );
}
