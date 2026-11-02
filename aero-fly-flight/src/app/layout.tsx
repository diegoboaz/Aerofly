import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AeroFly — Radar Operacional de Voos no Brasil",
  description:
    "Monitoramento em tempo real do fluxo de voos concluídos e cancelamentos nas operações aéreas brasileiras, com pipeline de dados automatizada em Python.",
};

export const viewport: Viewport = {
  themeColor: "#04070e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#04070e] font-display text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
