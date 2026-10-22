import type { Metadata } from "next";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
