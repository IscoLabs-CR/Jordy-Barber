"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "@/lib/types";
import {
  SERVICES,
  type ServiceType,
  type Slot,
  type Interval,
  getService,
  generateDaySlots,
  shopInstant,
  addDaysStr,
  shopToday,
  formatShopTime,
  longDateLabel,
  upcomingDates,
  dateParts,
  isSunday,
  minutesToLabel,
  formatCRC,
  weekRange,
  weekRangeLabel,
  OPEN_MIN,
  CLOSE_MIN,
  SLOT_STEP_MIN,
  SHOP_NAME,
} from "@/lib/booking";
import type { SupabaseClient } from "@supabase/supabase-js";

type ModalState =
  | null
  | { type: "new" }
  | { type: "block" }
  | { type: "reschedule"; appt: Appointment };

interface WeekStats {
  expected: number;
  realized: number;
  count: number;
  startStr: string;
}

export default function Dashboard({
  barberId,
  barberName,
}: {
  barberId: string;
  barberName: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [dateStr, setDateStr] = useState<string>(shopToday());
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [week, setWeek] = useState<WeekStats | null>(null);

  const load = useCallback(
    async (d: string) => {
      setLoading(true);
      const dayStart = shopInstant(d, 0);
      const dayEnd = shopInstant(addDaysStr(d, 1), 0);
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .gte("start_time", dayStart.toISOString())
        .lt("start_time", dayEnd.toISOString())
        .order("start_time");
      setAppts((data ?? []) as Appointment[]);
      setLoading(false);
    },
    [supabase],
  );

  // Weekly earnings: expected = all this week's bookings; realized = the ones
  // already finished (end_time <= now). Percentage = realized / expected.
  const loadWeek = useCallback(async () => {
    const wr = weekRange();
    const { data } = await supabase
      .from("appointments")
      .select("service_type, end_time")
      .eq("kind", "booking")
      .gte("start_time", wr.start.toISOString())
      .lt("start_time", wr.end.toISOString());
    const rows = (data ?? []) as {
      service_type: ServiceType | null;
      end_time: string;
    }[];
    const now = Date.now();
    let expected = 0;
    let realized = 0;
    let count = 0;
    for (const r of rows) {
      if (!r.service_type) continue;
      const price = getService(r.service_type).priceCRC;
      expected += price;
      count += 1;
      if (new Date(r.end_time).getTime() <= now) realized += price;
    }
    setWeek({ expected, realized, count, startStr: wr.startStr });
  }, [supabase]);

  useEffect(() => {
    // Fetch the day's agenda from Supabase; setState happens after the async
    // load resolves, which is the intended data-fetching-in-effect pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(dateStr);
  }, [dateStr, load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWeek();
  }, [loadWeek]);

  // Realtime: live-refresh when this barber's appointments change (e.g. a
  // client books a slot). RLS restricts the stream to this barber's rows.
  useEffect(() => {
    const channel = supabase
      .channel(`appointments-${barberId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `barber_id=eq.${barberId}`,
        },
        () => {
          load(dateStr);
          loadWeek();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, barberId, dateStr, load, loadWeek]);

  async function removeAppt(id: string) {
    if (!confirm("¿Eliminar este espacio de tu agenda?")) return;
    await supabase.from("appointments").delete().eq("id", id);
    load(dateStr);
    loadWeek();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/barbero/login");
    router.refresh();
  }

  const isToday = dateStr === shopToday();

  return (
    <div className="flex-1">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3.5">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-brand">
              {SHOP_NAME}
            </p>
            <p className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
              {barberName}
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-5 pb-20">
        {/* Weekly earnings */}
        {week && <WeeklyPanel week={week} />}

        {/* Date navigator */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => setDateStr((d) => addDaysStr(d, -1))}
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-colors hover:border-brand hover:text-brand"
            aria-label="Día anterior"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="font-display text-xl font-semibold uppercase tracking-tight text-ink">
              {longDateLabel(dateStr)}
            </p>
            {!isToday && (
              <button
                onClick={() => setDateStr(shopToday())}
                className="text-xs font-medium text-brand hover:text-brand-deep"
              >
                Ir a hoy
              </button>
            )}
            {isToday && (
              <p className="text-xs uppercase tracking-wider text-muted">Hoy</p>
            )}
          </div>
          <button
            onClick={() => setDateStr((d) => addDaysStr(d, 1))}
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-colors hover:border-brand hover:text-brand"
            aria-label="Día siguiente"
          >
            ›
          </button>
        </div>

        {/* Actions */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => setModal({ type: "new" })}
            className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-3 font-display text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep"
          >
            + Nueva cita
          </button>
          <button
            onClick={() => setModal({ type: "block" })}
            className="inline-flex items-center justify-center rounded-full border border-line px-4 py-3 font-display text-sm font-semibold uppercase tracking-wide text-ink transition-colors hover:border-brand hover:text-brand"
          >
            Bloquear horario
          </button>
        </div>

        {/* Agenda */}
        <div className="mt-6">
          {loading ? (
            <p className="py-12 text-center text-muted">Cargando agenda…</p>
          ) : appts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-5 py-12 text-center">
              <p className="text-ink">No tenés citas ni bloqueos este día.</p>
              <p className="mt-1 text-sm text-muted">
                Los clientes pueden reservar contigo desde la web.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3">
              {appts.map((a) => (
                <AgendaRow
                  key={a.id}
                  appt={a}
                  onDelete={() => removeAppt(a.id)}
                  onReschedule={() =>
                    setModal({ type: "reschedule", appt: a })
                  }
                />
              ))}
            </ul>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          Esta es tu agenda privada. Ningún otro barbero puede verla.
        </p>
      </div>

      {modal?.type === "new" && (
        <NewAppointmentModal
          supabase={supabase}
          barberId={barberId}
          defaultDate={dateStr}
          onClose={() => setModal(null)}
          onDone={(d) => {
            setModal(null);
            setDateStr(d);
            load(d);
          }}
        />
      )}
      {modal?.type === "block" && (
        <BlockModal
          supabase={supabase}
          barberId={barberId}
          defaultDate={dateStr}
          onClose={() => setModal(null)}
          onDone={(d) => {
            setModal(null);
            setDateStr(d);
            load(d);
          }}
        />
      )}
      {modal?.type === "reschedule" && (
        <RescheduleModal
          supabase={supabase}
          appt={modal.appt}
          onClose={() => setModal(null)}
          onDone={(d) => {
            setModal(null);
            setDateStr(d);
            load(d);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------- weekly panel */

function WeeklyPanel({ week }: { week: WeekStats }) {
  const pct =
    week.expected > 0 ? Math.round((week.realized / week.expected) * 100) : 0;
  return (
    <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="pole absolute inset-y-0 left-0 w-1.5" aria-hidden />
      <div className="py-4 pl-6 pr-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
            Esta semana
          </p>
          <p className="text-xs text-muted">{weekRangeLabel(week.startStr)}</p>
        </div>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="font-display text-4xl font-bold leading-none text-brand">
              {pct}%
            </p>
            <p className="mt-1 text-xs text-muted">
              del dinero esperado ya realizado
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-medium text-ink">
              {formatCRC(week.realized)}
            </p>
            <p className="text-xs text-muted">
              de {formatCRC(week.expected)} · {week.count}{" "}
              {week.count === 1 ? "corte" : "cortes"}
            </p>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- agenda */

function AgendaRow({
  appt,
  onDelete,
  onReschedule,
}: {
  appt: Appointment;
  onDelete: () => void;
  onReschedule: () => void;
}) {
  const isBlock = appt.kind === "block";
  const svc = appt.service_type ? getService(appt.service_type) : null;

  return (
    <li className="relative overflow-hidden rounded-2xl border border-line bg-paper">
      <div
        className={`absolute inset-y-0 left-0 w-1.5 ${isBlock ? "pole" : "bg-brand"}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 py-4 pl-5 pr-4">
        <div className="flex gap-4">
          <div className="text-center">
            <p className="font-mono text-lg font-medium leading-none text-ink">
              {formatShopTime(appt.start_time)}
            </p>
            <p className="mt-1 font-mono text-xs text-muted">
              {formatShopTime(appt.end_time)}
            </p>
          </div>
          <div>
            {isBlock ? (
              <>
                <p className="font-display text-base font-semibold uppercase tracking-wide text-ink">
                  Bloqueado
                </p>
                <p className="text-sm text-muted">Tiempo personal</p>
              </>
            ) : (
              <>
                <p className="font-display text-base font-semibold uppercase tracking-wide text-ink">
                  {appt.client_name}
                </p>
                <p className="text-sm text-muted">
                  {svc?.label}
                  {svc && ` · ${formatCRC(svc.priceCRC)}`}
                </p>
                {appt.client_phone && (
                  <a
                    href={`tel:${appt.client_phone}`}
                    className="mt-0.5 inline-block font-mono text-xs text-brand hover:text-brand-deep"
                  >
                    {appt.client_phone}
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!isBlock && (
            <button
              onClick={onReschedule}
              className="text-xs font-medium text-brand hover:text-brand-deep"
            >
              Reagendar
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-xs font-medium text-muted hover:text-brand-deep"
          >
            Eliminar
          </button>
        </div>
      </div>
    </li>
  );
}

/* --------------------------------------------------------------- shared */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-5"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-paper p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold uppercase tracking-tight text-ink">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-line hover:text-brand"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function DayChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (d: string) => void;
}) {
  const dates = upcomingDates(14);
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {dates.map((d) => {
        const p = dateParts(d);
        const sun = isSunday(d);
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            disabled={sun}
            onClick={() => onChange(d)}
            className={[
              "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition-colors",
              sun
                ? "cursor-not-allowed border-line bg-line/40 text-muted/60"
                : active
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-paper text-ink hover:border-brand",
            ].join(" ")}
          >
            <span className="text-[10px] uppercase tracking-wider">
              {p.weekdayShort}
            </span>
            <span className="font-mono text-base font-medium leading-tight">
              {p.day}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SlotButtons({
  slots,
  loading,
  selectedMin,
  onSelect,
}: {
  slots: Slot[];
  loading: boolean;
  selectedMin: number | null;
  onSelect: (s: Slot) => void;
}) {
  if (loading)
    return <p className="py-6 text-center text-muted">Cargando horarios…</p>;
  if (!slots.some((s) => s.available))
    return (
      <p className="py-6 text-center text-muted">
        Sin horarios libres este día.
      </p>
    );
  return (
    <div className="grid grid-cols-4 gap-2">
      {slots.map((s) =>
        s.available ? (
          <button
            key={s.startMin}
            type="button"
            onClick={() => onSelect(s)}
            className={[
              "rounded-lg border py-2 font-mono text-sm transition-colors",
              selectedMin === s.startMin
                ? "border-brand bg-brand text-white"
                : "border-brand/50 bg-brand-tint text-brand hover:bg-brand hover:text-white",
            ].join(" ")}
          >
            {s.label}
          </button>
        ) : (
          <div
            key={s.startMin}
            className="rounded-lg border border-line bg-line/40 py-2 text-center font-mono text-sm text-muted/60 line-through"
          >
            {s.label}
          </div>
        ),
      )}
    </div>
  );
}

function ModalError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-brand/30 bg-brand-tint px-4 py-2.5 text-sm text-brand-deep">
      {children}
    </p>
  );
}

function useBusy(supabase: SupabaseClient) {
  return useCallback(
    async (d: string, excludeId?: string): Promise<Interval[]> => {
      const dayStart = shopInstant(d, 0).toISOString();
      const dayEnd = shopInstant(addDaysStr(d, 1), 0).toISOString();
      let q = supabase
        .from("appointments")
        .select("id, start_time, end_time")
        .gte("start_time", dayStart)
        .lt("start_time", dayEnd);
      if (excludeId) q = q.neq("id", excludeId);
      const { data } = await q;
      return ((data ?? []) as { start_time: string; end_time: string }[]).map(
        (r) => ({ start: new Date(r.start_time), end: new Date(r.end_time) }),
      );
    },
    [supabase],
  );
}

/* ------------------------------------------------------------ new modal */

function NewAppointmentModal({
  supabase,
  barberId,
  defaultDate,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient;
  barberId: string;
  defaultDate: string;
  onClose: () => void;
  onDone: (d: string) => void;
}) {
  const fetchBusy = useBusy(supabase);
  const [service, setService] = useState<ServiceType>("sencillo");
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingSlots(true);
      setSlot(null);
      const busy = await fetchBusy(date);
      if (!alive) return;
      setSlots(generateDaySlots(date, getService(service).durationMin, busy));
      setLoadingSlots(false);
    })();
    return () => {
      alive = false;
    };
  }, [date, service, fetchBusy]);

  async function submit() {
    if (!slot) {
      setError("Elegí un horario.");
      return;
    }
    if (name.trim().length === 0) {
      setError("Escribí el nombre del cliente.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("book_appointment", {
      p_barber_id: barberId,
      p_start: slot.start.toISOString(),
      p_service_type: service,
      p_name: name.trim(),
      p_phone: phone.trim(),
    });
    setSubmitting(false);
    if (error) {
      setError(error.message || "No se pudo crear la cita.");
      const busy = await fetchBusy(date);
      setSlots(generateDaySlots(date, getService(service).durationMin, busy));
      return;
    }
    onDone(date);
  }

  return (
    <Modal title="Nueva cita" onClose={onClose}>
      <div className="grid gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Servicio</p>
          <div className="grid gap-2">
            {SERVICES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setService(s.id)}
                className={[
                  "flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors",
                  service === s.id
                    ? "border-brand bg-brand-tint"
                    : "border-line hover:border-brand",
                ].join(" ")}
              >
                <span className="text-sm font-medium text-ink">{s.label}</span>
                <span className="font-mono text-xs text-muted">
                  {formatCRC(s.priceCRC)} · {s.durationMin} min
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Día</p>
          <DayChips value={date} onChange={setDate} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Horario</p>
          <SlotButtons
            slots={slots}
            loading={loadingSlots}
            selectedMin={slot?.startMin ?? null}
            onSelect={setSlot}
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Nombre del cliente
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-line px-4 py-2.5 text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Teléfono
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-line px-4 py-2.5 text-ink outline-none focus:border-brand"
          />
        </label>

        {error && <ModalError>{error}</ModalError>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-1 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 font-display font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Crear cita"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- block modal */

function BlockModal({
  supabase,
  barberId,
  defaultDate,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient;
  barberId: string;
  defaultDate: string;
  onClose: () => void;
  onDone: (d: string) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [startMin, setStartMin] = useState(OPEN_MIN);
  const [endMin, setEndMin] = useState(OPEN_MIN + SLOT_STEP_MIN);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const startOptions: number[] = [];
  for (let m = OPEN_MIN; m <= CLOSE_MIN - SLOT_STEP_MIN; m += SLOT_STEP_MIN)
    startOptions.push(m);
  const endOptions: number[] = [];
  for (let m = startMin + SLOT_STEP_MIN; m <= CLOSE_MIN; m += SLOT_STEP_MIN)
    endOptions.push(m);

  async function submit() {
    if (endMin <= startMin) {
      setError("La hora de fin debe ser posterior al inicio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from("appointments").insert({
      barber_id: barberId,
      start_time: shopInstant(date, startMin).toISOString(),
      end_time: shopInstant(date, endMin).toISOString(),
      kind: "block",
    });
    setSubmitting(false);
    if (error) {
      setError("Ese horario se cruza con otro espacio de tu agenda.");
      return;
    }
    onDone(date);
  }

  return (
    <Modal title="Bloquear horario" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-muted">
          Reservá tiempo para vos. Los clientes no podrán agendar en ese rango.
        </p>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Día</p>
          <DayChips value={date} onChange={setDate} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Desde
            </span>
            <select
              value={startMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                setStartMin(v);
                if (endMin <= v) setEndMin(v + SLOT_STEP_MIN);
              }}
              className="w-full rounded-xl border border-line px-3 py-2.5 font-mono text-ink outline-none focus:border-brand"
            >
              {startOptions.map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Hasta
            </span>
            <select
              value={endMin}
              onChange={(e) => setEndMin(Number(e.target.value))}
              className="w-full rounded-xl border border-line px-3 py-2.5 font-mono text-ink outline-none focus:border-brand"
            >
              {endOptions.map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <ModalError>{error}</ModalError>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-1 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 font-display font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Bloquear"}
        </button>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------- reschedule modal */

function RescheduleModal({
  supabase,
  appt,
  onClose,
  onDone,
}: {
  supabase: SupabaseClient;
  appt: Appointment;
  onClose: () => void;
  onDone: (d: string) => void;
}) {
  const fetchBusy = useBusy(supabase);
  const durationMin = Math.round(
    (new Date(appt.end_time).getTime() - new Date(appt.start_time).getTime()) /
      60000,
  );
  // The appointment's calendar day in the shop timezone (YYYY-MM-DD).
  const startDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
  }).format(new Date(appt.start_time));

  const [date, setDate] = useState(startDateStr);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingSlots(true);
      setSlot(null);
      const busy = await fetchBusy(date, appt.id);
      if (!alive) return;
      setSlots(generateDaySlots(date, durationMin, busy));
      setLoadingSlots(false);
    })();
    return () => {
      alive = false;
    };
  }, [date, durationMin, appt.id, fetchBusy]);

  async function submit() {
    if (!slot) {
      setError("Elegí un nuevo horario.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase
      .from("appointments")
      .update({
        start_time: slot.start.toISOString(),
        end_time: slot.end.toISOString(),
      })
      .eq("id", appt.id);
    setSubmitting(false);
    if (error) {
      setError("Ese horario se cruza con otro espacio.");
      const busy = await fetchBusy(date, appt.id);
      setSlots(generateDaySlots(date, durationMin, busy));
      return;
    }
    onDone(date);
  }

  return (
    <Modal title="Reagendar cita" onClose={onClose}>
      <div className="grid gap-4">
        <div className="rounded-xl border border-line bg-line/30 px-4 py-3 text-sm">
          <span className="font-medium text-ink">{appt.client_name}</span>
          <span className="text-muted">
            {" "}
            · {formatShopTime(appt.start_time)} → mover a…
          </span>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Día</p>
          <DayChips value={date} onChange={setDate} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Nuevo horario</p>
          <SlotButtons
            slots={slots}
            loading={loadingSlots}
            selectedMin={slot?.startMin ?? null}
            onSelect={setSlot}
          />
        </div>

        {error && <ModalError>{error}</ModalError>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-1 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 font-display font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {submitting ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </Modal>
  );
}
