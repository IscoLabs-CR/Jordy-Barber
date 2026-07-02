import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Emails the barber (via Resend) when a booking is inserted, fired by the
// notify_booking() DB trigger through pg_net. Credentials come from env first,
// then the app_config table (resend_api_key, notify_from); the recipient is the
// barber's notify_email.

const SHOP_TZ = "America/Costa_Rica";
const SERVICE_LABELS: Record<string, string> = {
  sencillo: "Corte sencillo",
  sombreado: "Corte sombreado",
  lavado_cejas: "Corte + Lavado + Cejas",
  barba: "Corte + Barba",
  full: "Full service",
};
const SERVICE_PRICES: Record<string, number> = {
  sencillo: 4000,
  sombreado: 5000,
  lavado_cejas: 5500,
  barba: 6000,
  full: 7500,
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function rest(path: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) return [];
  return await res.json();
}

function fmt(dt: string) {
  const d = new Date(dt);
  const date = new Intl.DateTimeFormat("es-CR", {
    timeZone: SHOP_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const time = new Intl.DateTimeFormat("es-CR", {
    timeZone: SHOP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date, time };
}

function colones(n: number): string {
  return n ? `₡${n.toLocaleString("en-US")}` : "—";
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const id = payload.appointment_id ?? payload.record?.id;
    if (!id) return json({ ok: false, reason: "missing appointment_id" });

    const rows = await rest(
      `appointments?id=eq.${id}&select=id,kind,client_name,client_phone,service_type,start_time,end_time,barbers(name,notify_email)`,
    );
    const appt = rows[0];
    if (!appt) return json({ ok: false, reason: "appointment not found" });
    if (appt.kind !== "booking") return json({ ok: true, reason: "not a booking" });

    const barber = Array.isArray(appt.barbers) ? appt.barbers[0] : appt.barbers;
    const to = barber?.notify_email;
    if (!to) return json({ ok: true, reason: "barber has no notify_email" });

    let resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    let from = Deno.env.get("NOTIFY_FROM") ?? "";
    if (!resendKey || !from) {
      const cfg = await rest(`app_config?select=name,value`);
      const map = new Map(cfg.map((r: { name: string; value: string }) => [r.name, r.value]));
      resendKey = resendKey || (map.get("resend_api_key") ?? "");
      from = from || (map.get("notify_from") ?? "onboarding@resend.dev");
    }
    if (!from.includes("<")) from = `Jordy Barber <${from}>`;
    if (!resendKey) return json({ ok: false, reason: "no resend api key configured" });

    const { date, time } = fmt(appt.start_time);
    const svc = SERVICE_LABELS[appt.service_type ?? ""] ?? appt.service_type ?? "Servicio";
    const price = colones(SERVICE_PRICES[appt.service_type ?? ""] ?? 0);
    const subject = `Nueva cita · ${appt.client_name} · ${date} ${time}`;

    const rrow = (label: string, value: string, bold = false) =>
      `<tr><td style="color:#64748b;padding:6px 0;font-size:14px;">${label}</td>` +
      `<td style="text-align:right;padding:6px 0;font-size:14px;${bold ? "font-weight:bold;" : ""}">${value}</td></tr>`;

    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#0b1f2a;max-width:520px;margin:0 auto;">` +
      `<div style="background:#0077b6;color:#ffffff;padding:16px 20px;border-radius:12px 12px 0 0;">` +
      `<strong style="font-size:18px;letter-spacing:2px;">NUEVA CITA</strong></div>` +
      `<div style="border:1px solid #e6ebf0;border-top:none;border-radius:0 0 12px 12px;padding:8px 20px 20px;">` +
      `<table style="width:100%;border-collapse:collapse;">` +
      rrow("Cliente", appt.client_name ?? "—", true) +
      rrow("Teléfono", appt.client_phone ?? "—") +
      rrow("Servicio", svc) +
      rrow("Precio", price) +
      rrow("Día", date) +
      rrow("Hora", time, true) +
      rrow("Barbero", barber?.name ?? "—") +
      `</table></div></div>`;

    const text =
      `Nueva cita\n\nCliente: ${appt.client_name}\nTeléfono: ${appt.client_phone ?? "—"}\n` +
      `Servicio: ${svc}\nPrecio: ${price}\nDía: ${date}\nHora: ${time}\nBarbero: ${barber?.name ?? "—"}`;

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    const body = await sendRes.json();
    return json({ ok: sendRes.ok, status: sendRes.status, body });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
