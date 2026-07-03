import type { Metadata, Viewport } from "next";
import { Oswald, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono-ticket",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jordy Barber — Reserva tu cita",
  description:
    "Agenda tu corte con tu barbero preferido. Elegí barbero, día y estilo, sin cuenta.",
  // iOS no toma todo del manifest: necesita el apple-touch-icon y el meta
  // apple-mobile-web-app para instalarse "a pantalla completa" y habilitar push.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Jordy Barber",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0077b6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${oswald.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
