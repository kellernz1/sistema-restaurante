import type { Metadata } from "next";
import { ThemePicker } from "@/components/theme-picker";
import { themeInitialization } from "@/lib/theme-initialization";


import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema de Restaurante",
  description: "Gestão integrada de pedidos e atendimento para restaurantes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitialization }} />
        {children}
        <ThemePicker />
      </body>
    </html>
  );
}
