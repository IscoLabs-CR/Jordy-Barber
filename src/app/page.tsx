import Link from "next/link";
import { SHOP_NAME } from "@/lib/booking";

export default function Home() {
  return (
    <main className="flex-1 grid place-items-center px-5 py-10">
      <div className="w-full max-w-xl">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-paper shadow-[0_24px_70px_-40px_rgba(2,62,90,0.55)]">
          <div className="pole absolute inset-y-0 left-0 w-2.5" aria-hidden />

          <div className="px-8 py-14 text-center sm:px-14 sm:py-20">
            <p className="font-display text-xs uppercase tracking-[0.45em] text-brand">
              Barbería · Est. 2026
            </p>

            <h1 className="mt-4 font-display text-6xl font-bold uppercase leading-[0.95] tracking-tight text-ink sm:text-7xl">
              {SHOP_NAME}
            </h1>

            <p className="mx-auto mt-5 max-w-sm text-balance text-muted">
              Reservá tu silla. Elegí barbero, día y estilo — sin cuenta y sin
              filas.
            </p>

            <div className="mx-auto mt-10 flex max-w-xs flex-col gap-3">
              <Link
                href="/reservar"
                className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-4 font-display text-lg font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep"
              >
                Reservar cita
              </Link>
              <Link
                href="/barbero/login"
                className="inline-flex items-center justify-center rounded-full border border-line px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Soy barbero
              </Link>
            </div>

            <p className="mt-10 text-xs uppercase tracking-[0.25em] text-muted">
              Lun – Sáb · 8:00 a 18:00
            </p>
          </div>
        </div>

        <footer className="mt-6 text-center text-[11px] leading-relaxed text-muted/70 select-none">
          <p className="font-display uppercase tracking-[0.25em]">Isco Labs · 2026</p>
          <p className="mt-0.5 tracking-wide">
            Contacto:{" "}
            <a
              href="mailto:iscolabscr@gmail.com"
              className="transition-colors hover:text-brand"
            >
              iscolabscr@gmail.com
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
