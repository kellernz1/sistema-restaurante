"use client";

import { useTranslation } from "@/components/language-provider";


import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const storageKey = "mesa-certa-theme";
type Theme = "system" | "light" | "dark";
const normalize = (value: string | null | undefined): Theme => value === "light" || value === "dark" ? value : "system";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event("restaurant-theme-change"));
}

function subscribe(onChange: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) applyTheme(normalize(event.newValue));
  };
  window.addEventListener("restaurant-theme-change", onChange);
  window.addEventListener("storage", sync);
  return () => { window.removeEventListener("restaurant-theme-change", onChange); window.removeEventListener("storage", sync); };
}

export function ThemePicker() {
  const t = useTranslation();
  const theme = useSyncExternalStore(subscribe, () => normalize(document.documentElement.dataset.theme), () => "system" as Theme);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return <div className="theme-picker">
    <Icon size={17} aria-hidden="true" />
    <label htmlFor="appearance-theme">{t("Tema")}</label>
    <select id="appearance-theme" value={theme} onChange={(event) => {
      const selected = normalize(event.target.value);
      try { localStorage.setItem(storageKey, selected); } catch { /* Theme still works when storage is unavailable. */ }
      applyTheme(selected);
    }}>
      <option value="light">{t("Claro")}</option><option value="dark">{t("Escuro")}</option><option value="system">{t("Automático")}</option>
    </select>
  </div>;
}
