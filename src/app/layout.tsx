import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LayoutClient } from "./layout-client";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Éxito.cyou — Sintoniza tu mente. Crea tu realidad.",
  description: "Plataforma premium de programación mental auditiva, frecuencias solfeggio, ondas binaurales, streaming conversacional con IA y DJ online de estados de ánimo.",
  keywords: ["éxito.cyou", "exito.cyou", "programación mental auditiva", "ondas binaurales", "frecuencias solfeggio", "streaming conversacional", "música para enfoque", "mindset", "crecimiento personal"],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "Éxito.cyou — Sintoniza tu mente. Crea tu realidad.",
    description: "Plataforma premium de bienestar digital y programación mental auditiva.",
    url: "https://exito.cyou",
    siteName: "Éxito.cyou",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Éxito.cyou — Sintoniza tu mente. Crea tu realidad.",
    description: "Plataforma premium de bienestar digital y programación mental auditiva.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        {/* Favicon gestionado por metadata por-ruta (streaming: /favicon.svg · producción: /mediasuite-favicon.svg) */}
        {/* Preconnect al dominio CDN propio para reducir latencia de red crítica */}
        <link rel="preconnect" href="https://media.weblifetech.com" />
        <link rel="dns-prefetch" href="https://media.weblifetech.com" />
      </head>

      <body className="font-sans antialiased">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
