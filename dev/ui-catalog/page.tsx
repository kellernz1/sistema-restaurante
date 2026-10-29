import { getTranslation } from "@/lib/i18n/server";
import { UiCatalog } from "./catalog";
import "./catalog.css";

// Copied into the owned visual-test app only; never part of the restaurant build.
export default async function CatalogPage() {
  const t = await getTranslation();
  return <main className="ui-catalog"><h1>{t("Componentes da interface")}</h1><UiCatalog /></main>;
}
