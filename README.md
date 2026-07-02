# Jordy Barber — App de reservas

Web app para reservar citas de barbería. Los **clientes agendan sin crear cuenta** desde su
teléfono; el **barbero** gestiona su agenda desde un portal privado. Corre **localmente** (todavía sin
deploy).

> Este README es un resumen para retomar el proyecto (pensado para que una persona o un LLM entienda
> rápido en qué estado está, cómo funciona, por qué está hecho así y qué falta).

---

## Estado actual (TL;DR)

| Área | Estado |
|---|---|
| Reservas del cliente (`/reservar`) | ✅ Funcional y probado |
| Portal del barbero (`/barbero`) — agenda, crear/eliminar/reagendar/bloquear | ✅ Funcional |
| Login del barbero por **usuario y contraseña** | ✅ Funcional |
| Aislamiento por barbero + privacidad del cliente (RLS) | ✅ Verificado |
| Anti-sobreagendamiento (constraint en BD) | ✅ Verificado |
| Panel semanal de ingresos (% ya realizado) | ✅ Funcional |
| Agregar cita al calendario del teléfono (.ics con recordatorio 2 h) | ✅ Funcional |
| Notificación por correo al barbero (Resend) | 🟡 Construido y probado — **falta la API key de Resend** |
| Deploy (Vercel) | ⏸️ Pendiente a propósito (por ahora solo local) |

**Falta / próximos pasos:**
1. **Activar el correo**: conseguir una **API key de Resend** y el correo donde el barbero quiere recibir
   avisos. Se cargan por detrás (ver [Notificaciones por correo](#notificaciones-por-correo-resend)); no
   hay UI para esto (se quitó a propósito para evitar errores del usuario).
2. **Deploy a Vercel** cuando se decida publicarlo.

---

## Stack tecnológico

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v3** (ver [Notas de entorno](#notas-de-entorno))
- **Supabase**: Postgres + Auth + Realtime + Edge Functions
- **@supabase/ssr** para la sesión del barbero (cookies) — protección de rutas en `src/proxy.ts`
- **date-fns / date-fns-tz** para zona horaria (`America/Costa_Rica`)
- **Resend** (HTTP API) para el correo de aviso al barbero
- Proyecto Supabase: `barbershop`, ref **`iojrjtuwfpeqxdizuokv`**, región `us-east-1`

---

## Reglas de negocio

- **Barbero único:** Jordy Meza.
- **Horario:** Lunes a Sábado; abre **8:00**, la **última cita empieza a las 18:00 (6 pm)**
  (`CLOSE_MIN` = 19:00, así un corte de 1 h termina a las 7 pm). Domingos cerrado.
- **Zona horaria:** `America/Costa_Rica`.
- **Rejilla de horarios:** cada **30 minutos**.
- **Servicios y precios** (definidos en `src/lib/booking.ts`):

  | Servicio | Duración | Precio |
  |---|---|---|
  | Corte sencillo | 60 min | ₡4,000 |
  | Corte sombreado | 60 min | ₡5,000 |
  | Corte + Lavado + Cejas | 60 min | ₡5,500 |
  | Corte + Barba | 60 min | ₡6,000 |
  | Full service | 90 min | ₡7,500 |

- **Datos del cliente al reservar:** nombre + teléfono (sin login).

---

## Arquitectura y **por qué** está hecha así

### ¿Por qué un backend (y no solo el navegador)?
El cliente reserva desde **su** teléfono y el barbero lo ve en **su** dispositivo. Eso obliga a tener
datos **compartidos** entre dispositivos: con almacenamiento local del navegador, una reserva hecha en el
celular del cliente nunca llegaría a la pantalla del barbero. Además el barbero necesita login. Por eso hay
un backend.

### ¿Por qué Supabase?
Reúne en un solo servicio (con capa gratuita) todo lo que el problema pide:
- **Postgres** para datos relacionales y, sobre todo, **garantías a nivel de base de datos** (el constraint
  anti-solapamiento).
- **Auth** para el login del barbero.
- **Realtime** para que el dashboard del barbero se actualice en vivo cuando entra una reserva.
- **Edge Functions** para enviar el correo.
- **RLS (Row Level Security)** para privacidad y aislamiento sin escribir un backend propio.

### ¿Por qué los clientes usan RPCs y no leen la tabla directamente?
Requisito clave: **el cliente nunca debe ver el nombre/teléfono de otros clientes**, solo si un espacio
está ocupado. Con RLS, al rol anónimo **no** se le da `SELECT` sobre `appointments`. Toda la interacción del
cliente pasa por dos funciones `SECURITY DEFINER`:
- `get_busy(barbero, fecha)` → devuelve **solo rangos ocupados** (sin datos personales).
- `book_appointment(...)` → valida horario, rejilla y solapamiento, e inserta. Al ser transaccional, también
  evita la condición de carrera de dos clientes reservando el mismo espacio a la vez.

### ¿Por qué un constraint `EXCLUDE` en la base de datos?
Es la **garantía dura** contra dobles reservas: aunque la lógica de la app fallara o dos personas reservaran
en el mismo milisegundo, Postgres rechaza físicamente dos citas del mismo barbero que se solapen
(`EXCLUDE USING gist (barber_id WITH =, tstzrange(start,end) WITH &&)`).

### ¿Por qué rejilla de 30 minutos?
Todas las duraciones (60 y 90 min) son múltiplos de 30, así los horarios encajan limpio (:00 y :30) sin
dejar huecos muertos en la agenda.

### ¿Por qué el recordatorio es un archivo `.ics` y no una notificación del servidor?
El cliente solo da su teléfono (no correo), y montar push/SMS server-side sería complejo. Un evento
**iCalendar (.ics)** con una alarma `TRIGGER:-PT2H` hace que **el propio calendario del teléfono** dispare
el recordatorio 2 horas antes, offline y en iPhone/Android, sin infraestructura extra.

### ¿Por qué el login es por usuario si Supabase usa correo?
Supabase Auth es por correo. Para tener UX de **usuario/contraseña**, el formulario mapea el usuario a un
correo interno fijo e invisible (`usuario@jordybarber.local`) antes de autenticar. Así se reutiliza el auth
nativo sin exponer correos. El correo "real" queda libre solo para Resend/avisos.

### ¿Por qué Next.js App Router con server + client components?
- **Server components** (p. ej. `reservar/page.tsx`, `barbero/page.tsx`) leen datos y validan sesión con
  cookies (`@supabase/ssr`).
- **Client components** (el asistente de reserva, el dashboard) manejan la interacción y el Realtime.
- La protección de `/barbero` vive en `src/proxy.ts` (en Next 16 la convención `middleware` se renombró a
  `proxy`).

---

## Modelo de datos y seguridad

**Tablas (esquema `public`):**
- `barbers` — `id` (= id de usuario de Auth), `name`, `display_order`, `active`, `notify_email`.
  Lectura pública (para listar barberos); el correo de avisos se setea por SQL.
- `appointments` — `barber_id`, `start_time`, `end_time`, `service_type` (`sencillo|sombreado|lavado_cejas|
  barba|full`), `kind` (`booking|block`), `client_name`, `client_phone`, `created_at`.
  Constraint `EXCLUDE` anti-solapamiento + `CHECK` de servicios válidos.
- `app_config` — clave/valor privado (RLS sin políticas → solo el rol de servicio lo lee). Guarda la API key
  de Resend.

**RLS:**
- Anónimo (cliente): **sin** `SELECT` a `appointments`; solo puede llamar `get_busy` y `book_appointment`.
- Barbero autenticado: CRUD **solo** sobre sus propias filas (`barber_id = auth.uid()`), lo que garantiza
  que ningún barbero ve la agenda de otro.

**Funciones RPC:** `get_busy`, `book_appointment` (ambas `SECURITY DEFINER`).

**Realtime:** publicación sobre `appointments`, respetando RLS por usuario.

### Notificaciones por correo (Resend)
Flujo: al insertarse una reserva → trigger `trg_notify_booking` → `pg_net` llama (async) a la **Edge
Function `notify-booking`** → esta arma el correo y lo envía con **Resend** al `notify_email` del barbero.
Ya está desplegado y probado de punta a punta (round-trip 200). **Para activarlo falta:**
1. Guardar la API key: `insert into app_config(name,value) values ('resend_api_key','re_...')`.
2. Setear el correo del barbero: `update barbers set notify_email = 'correo@real.com' where display_order=1`.
3. Nota Resend: en modo de prueba (remitente `onboarding@resend.dev`) solo entrega al correo dueño de la
   cuenta Resend; para enviar a cualquier correo hay que **verificar un dominio** en Resend.

---

## Estructura del proyecto (archivos clave)

```
src/
  lib/
    booking.ts            # Núcleo: servicios, precios, duraciones, horario, rejilla, disponibilidad, semana
    calendar.ts           # Genera el .ics (evento + recordatorio 2 h) y lo abre
    types.ts              # Tipos Barber / Appointment
    supabase/
      client.ts           # Cliente Supabase (navegador)
      server.ts           # Cliente Supabase (server components)
      middleware.ts       # Helper de sesión usado por el proxy
  proxy.ts                # Protege /barbero (redirige a login si no hay sesión)
  app/
    page.tsx              # Landing ("Jordy Barber")
    reservar/
      page.tsx            # Carga barberos (server)
      Wizard.tsx          # Asistente de reserva + pop-up de calendario (client)
    barbero/
      login/page.tsx      # Login por usuario/contraseña
      page.tsx            # Verifica sesión y carga el barbero (server)
      Dashboard.tsx       # Agenda, acciones, panel semanal, Realtime (client)
supabase/
  functions/
    notify-booking/index.ts   # Aviso por correo (Resend) al barbero (trigger -> pg_net -> aquí)
  (migraciones aplicadas al proyecto remoto vía MCP)
.env.local               # NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable)
```

---

## Cómo correrlo localmente

```bash
npm install
npm run dev
# http://localhost:3000
```

Requiere `.env.local` (ya presente) con:
```
NEXT_PUBLIC_SUPABASE_URL=https://iojrjtuwfpeqxdizuokv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

**Rutas:** `/` (inicio) · `/reservar` (cliente) · `/barbero/login` · `/barbero` (dashboard).

**Credenciales del barbero (prueba):** usuario **`Jordi.Barber`** · contraseña **`Barberia1919`**.

---

## Notas de entorno

- **Tailwind está fijado en la v3** (no v4). La v4 usa un binario nativo (`@tailwindcss/oxide`) que en esta
  máquina Windows queda **bloqueado por Application Control** ("An Application Control policy has blocked this
  file"), lo que hacía que todas las páginas dieran error 500. La v3 es 100% JavaScript y evita el problema.
  **No “actualizar” a Tailwind v4 en este equipo.**
- Next 16 usa `src/proxy.ts` (no `middleware.ts`) para el middleware.
- La app asume la zona horaria de la barbería (`America/Costa_Rica`) como constante en `src/lib/booking.ts`.
