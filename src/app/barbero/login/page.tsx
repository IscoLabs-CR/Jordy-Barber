"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SHOP_NAME } from "@/lib/booking";

// Barbers log in with a username. Supabase Auth uses email under the hood, so we
// map the username to a fixed internal domain (never shown to the user).
const USERNAME_DOMAIN = "jordybarber.local";

// The Supabase session itself already persists for ~400 days (cookie storage),
// so a logged-in barber stays signed in across restarts. This only remembers the
// username to pre-fill it on the rare re-login (e.g. after "Salir"). We never
// store the password — the browser's password manager handles that securely.
const REMEMBER_KEY = "jordybarber:barber-username";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pre-fill the username if it was remembered on a previous login.
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    // Reading localStorage must happen in an effect (not a lazy initializer)
    // to avoid an SSR/client hydration mismatch on the input value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setUsername(saved);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const email = `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, username.trim());
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    router.push("/barbero");
    router.refresh();
  }

  return (
    <main className="flex-1 grid place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-paper p-8 shadow-[0_24px_70px_-40px_rgba(2,62,90,0.55)]">
          <div
            className="pole absolute inset-y-0 left-0 w-2.5"
            aria-hidden
          />

          <p className="font-display text-xs uppercase tracking-[0.35em] text-brand">
            {SHOP_NAME}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight text-ink">
            Ingreso barbero
          </h1>
          <p className="mt-1 text-sm text-muted">
            Accedé a tu agenda personal.
          </p>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Usuario
              </span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Jordi.Barber"
                className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Contraseña
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
                required
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand"
              />
              <span>Mantener sesión iniciada</span>
            </label>

            {error && (
              <p className="rounded-xl border border-brand/30 bg-brand-tint px-4 py-3 text-sm text-brand-deep">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3.5 font-display font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>

        <Link
          href="/"
          className="mt-5 block text-center text-sm text-muted transition-colors hover:text-brand"
        >
          ← Volver al inicio
        </Link>
      </div>
    </main>
  );
}
