"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createTranslator, LOCALE_COOKIE, type Locale } from "@/lib/i18n/catalog";

const LanguageContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({ locale: "pt-BR", setLocale: () => {} });

export function LanguageProvider({ locale: initialLocale, children }: { locale: Locale; children: ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const router = useRouter();
  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = next;
    updateLocale(next);
    router.refresh();
  }, [router]);
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export function useTranslation() {
  const { locale } = useLanguage();
  return useMemo(() => createTranslator(locale), [locale]);
}
