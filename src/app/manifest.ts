import type { MetadataRoute } from "next";

// Web App Manifest — hace la app instalable en la pantalla de inicio (iOS 16.4+
// y Android). `display: standalone` la abre sin barra del navegador, requisito
// para que iOS permita notificaciones push. Los iconos viven en /public.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jordy Barber — Reservas",
    short_name: "Jordy Barber",
    description:
      "Agenda de citas de la barbería: recibí un aviso cada vez que entra una reserva.",
    start_url: "/barbero",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0077b6",
    lang: "es",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
