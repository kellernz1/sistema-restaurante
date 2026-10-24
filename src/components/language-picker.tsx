"use client";

import { Languages } from "lucide-react";
import { useLanguage, useTranslation } from "./language-provider";

export function LanguagePicker() {
  const { locale, setLocale } = useLanguage();
  const t = useTranslation();
  return <div className="language-picker">
    <Languages size={17} aria-hidden="true" />
    <label htmlFor="interface-language">{t("Idioma")}</label>
    <select id="interface-language" value={locale} onChange={(event) => setLocale(event.target.value === "es" ? "es" : "pt-BR")}>
      <option value="pt-BR" lang="pt-BR">Português (Brasil)</option>
      <option value="es" lang="es">Español</option>
    </select>
  </div>;
}
