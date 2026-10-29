import { getTranslation } from "@/lib/i18n/server";
import type { Metadata } from "next";
import { PublicPreferences } from "@/components/public-preferences";
import { themeInitialization } from "@/lib/theme-initialization";
import { LanguageProvider } from "@/components/language-provider";
import { getLocale } from "@/lib/i18n/server";


import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslation();
  return {
  title: t("Sistema de Restaurante"),
  description: t("Gestão integrada de pedidos e atendimento para restaurantes."),
};
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitialization }} />
        <LanguageProvider locale={locale}>
          {children}
          <PublicPreferences />
        </LanguageProvider>
      </body>
    </html>
  );
}
