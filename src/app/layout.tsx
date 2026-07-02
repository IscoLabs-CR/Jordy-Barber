import type { Metadata } from "next";
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
