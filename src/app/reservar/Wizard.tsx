"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Barber } from "@/lib/types";
import { buildAppointmentICS, downloadICS } from "@/lib/calendar";
import {
  SERVICES,
  type ServiceType,
  type Slot,
  type Interval,
  getService,
  generateDaySlots,
  upcomingDates,
  dateParts,
  isSunday,
  longDateLabel,
  formatCRC,
  SHOP_NAME,
} from "@/lib/booking";

type Step = 0 | 1 | 2 | 3 | 4;
const ALL_STEPS: { index: Step; label: string }[] = [
  { index: 0, label: "Barbero" },
  { index: 1, label: "Fecha" },
  { index: 2, label: "Corte" },
  { index: 3, label: "Hora" },
  { index: 4, label: "Datos" },
];

interface Confirmation {
  barberName: string;
  dateStr: string;
  service: ServiceType;
  timeLabel: string;
  name: string;
  start: Date;
  end: Date;
  id: string | null;
}

export default function Wizard({ barbers }: { barbers: Barber[] }) {
  // With a single barber there is nothing to choose: preselect and skip step 0.
  const singleBarber = barbers.length === 1;
  const initialStep: Step = singleBarber ? 1 : 0;
  const visibleSteps = singleBarber
    ? ALL_STEPS.filter((s) => s.index !== 0)
    : ALL_STEPS;

  const [step, setStep] = useState<Step>(initialStep);
  const [barber, setBarber] = useState<Barber | null>(
    singleBarber ? barbers[0] : null,
  );
  const [dateStr, setDateStr] = useState<string | null>(null);
  const [service, setService] = useState<ServiceType | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);

  const dates = upcomingDates(21);

  function selectBarber(b: Barber) {
    setBarber(b);
    setDateStr(null);
    setService(null);
    setSlot(null);
    setError(null);
    setStep(1);
  }

  function selectDate(d: string) {
    if (isSunday(d)) return;
    setDateStr(d);
    setService(null);
    setSlot(null);
    setError(null);
    setStep(2);
  }

  function selectService(s: ServiceType) {
    setService(s);
    setSlot(null);
    setError(null);
    setStep(3);
    if (barber && dateStr) loadSlots(barber, dateStr, s);
  }

  async function loadSlots(b: Barber, d: string, s: ServiceType) {
    setLoadingSlots(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_busy", {
      p_barber_id: b.id,
      p_date: d,
    });
    if (error) {
      setError("No se pudo cargar la disponibilidad. Intentá de nuevo.");
      setSlots([]);
      setLoadingSlots(false);
      return;
    }
    const busy: Interval[] = ((data ?? []) as {
      start_time: string;
      end_time: string;
    }[]).map((r) => ({
      start: new Date(r.start_time),
      end: new Date(r.end_time),
    }));
    setSlots(generateDaySlots(d, getService(s).durationMin, busy));
    setLoadingSlots(false);
  }

  function selectSlot(s: Slot) {
    if (!s.available) return;
    setSlot(s);
    setError(null);
    setStep(4);
  }

  async function confirm() {
    if (!barber || !slot || !service || !dateStr) return;
    if (name.trim().length === 0) {
      setError("Escribí tu nombre para confirmar la cita.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("book_appointment", {
      p_barber_id: barber.id,
      p_start: slot.start.toISOString(),
      p_service_type: service,
      p_name: name.trim(),
      p_phone: phone.trim(),
    });
    setSubmitting(false);
    if (error) {
      setError(error.message || "No se pudo confirmar la cita.");
      // Refresh availability in case the slot was just taken by someone else.
      loadSlots(barber, dateStr, service);
      return;
    }
    setDone({
      barberName: barber.name,
      dateStr,
      service,
      timeLabel: slot.label,
      name: name.trim(),
      start: slot.start,
      end: slot.end,
      id: (data as string | null) ?? null,
    });
  }

  function reset() {
    setStep(initialStep);
    setBarber(singleBarber ? barbers[0] : null);
    setDateStr(null);
    setService(null);
    setSlots([]);
    setSlot(null);
    setName("");
    setPhone("");
    setError(null);
    setDone(null);
  }

  if (done) return <SuccessScreen data={done} onAgain={reset} />;

  return (
    <div className="flex-1">
      <BookingHeader />

      <div className="mx-auto w-full max-w-2xl px-5 pb-16">
        <Stepper
          steps={visibleSteps}
          current={step}
          onGoTo={(s) => s <= step && setStep(s)}
        />

        <div className="mt-7">
          {step === 0 && (
            <Section title="¿Con quién te cortás el pelo?">
              <div className="grid gap-3">
                {barbers.length === 0 && (
                  <p className="text-muted">
                    No hay barberos disponibles por ahora.
                  </p>
                )}
                {barbers.map((b) => (
                  <OptionRow
                    key={b.id}
                    active={barber?.id === b.id}
                    onClick={() => selectBarber(b)}
                    title={b.name}
                    subtitle="Barbero"
                  />
                ))}
              </div>
            </Section>
          )}

          {step === 1 && (
            <Section
              title="Elegí el día"
              hint={barber ? `Con ${barber.name}` : undefined}
            >
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {dates.map((d) => {
                  const p = dateParts(d);
                  const sun = isSunday(d);
                  const active = dateStr === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={sun}
                      onClick={() => selectDate(d)}
                      aria-label={
                        sun ? "Cerrado los domingos" : longDateLabel(d)
                      }
                      className={[
                        "flex flex-col items-center rounded-2xl border px-2 py-3 transition-colors",
                        sun
                          ? "cursor-not-allowed border-line bg-line/40 text-muted/60"
                          : active
                            ? "border-brand bg-brand text-white"
                            : "border-line bg-paper text-ink hover:border-brand hover:bg-brand-tint",
                      ].join(" ")}
                    >
                      <span className="text-[11px] uppercase tracking-wider">
                        {p.weekdayShort}
                      </span>
                      <span className="font-mono text-xl font-medium leading-tight">
                        {p.day}
                      </span>
                      <span className="text-[11px] lowercase">
                        {sun ? "cerrado" : p.monthShort}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section
              title="¿Qué te hacés hoy?"
              hint={dateStr ? longDateLabel(dateStr) : undefined}
            >
              <div className="grid gap-3">
                {SERVICES.map((s) => (
                  <OptionRow
                    key={s.id}
                    active={service === s.id}
                    onClick={() => selectService(s.id)}
                    title={s.label}
                    subtitle={s.description}
                    trailing={formatCRC(s.priceCRC)}
                  />
                ))}
              </div>
            </Section>
          )}

          {step === 3 && (
            <Section
              title="Elegí tu horario"
              hint={
                dateStr && service
                  ? `${longDateLabel(dateStr)} · ${getService(service).label}`
                  : undefined
              }
            >
              <SlotGrid
                slots={slots}
                loading={loadingSlots}
                selectedMin={slot?.startMin ?? null}
                onSelect={selectSlot}
                onBackToDate={() => setStep(1)}
              />
            </Section>
          )}

          {step === 4 && barber && dateStr && service && slot && (
            <Section title="Tus datos">
              <TicketSummary
                barberName={barber.name}
                dateStr={dateStr}
                service={service}
                timeLabel={slot.label}
              />

              <div className="mt-5 grid gap-4">
                <Field
                  label="Nombre"
                  required
                  value={name}
                  onChange={setName}
                  placeholder="Tu nombre"
                  autoFocus
                />
                <Field
                  label="Teléfono"
                  type="tel"
                  value={phone}
                  onChange={setPhone}
                  placeholder="Para confirmarte la cita"
                />
              </div>

              {error && <ErrorNote>{error}</ErrorNote>}

              <button
                type="button"
                onClick={confirm}
                disabled={submitting}
                className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-4 font-display text-lg font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
              >
                {submitting ? "Confirmando…" : "Confirmar cita"}
              </button>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function BookingHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-3.5">
        <Link
          href="/"
          className="font-display text-lg font-semibold uppercase tracking-wide text-ink"
        >
          {SHOP_NAME}
        </Link>
        <Link
          href="/"
          className="text-sm text-muted transition-colors hover:text-brand"
        >
          Cancelar
        </Link>
      </div>
    </header>
  );
}

function Stepper({
  steps,
  current,
  onGoTo,
}: {
  steps: { index: Step; label: string }[];
  current: number;
  onGoTo: (s: Step) => void;
}) {
  return (
    <nav className="mt-6" aria-label="Progreso de la reserva">
      <ol className="flex items-center gap-1.5">
        {steps.map(({ index, label }) => {
          const state =
            index < current
              ? "done"
              : index === current
                ? "current"
                : "upcoming";
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => onGoTo(index)}
                disabled={index > current}
                className={[
                  "h-1.5 w-full rounded-full transition-colors",
                  state === "upcoming" ? "bg-line" : "bg-brand",
                ].join(" ")}
                aria-label={label}
              />
              <span
                className={[
                  "text-[10px] font-medium uppercase tracking-wider sm:text-xs",
                  state === "current"
                    ? "text-brand"
                    : state === "done"
                      ? "text-ink"
                      : "text-muted",
                ].join(" ")}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h1 className="font-display text-2xl font-semibold uppercase tracking-tight text-ink">
        {title}
      </h1>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function OptionRow({
  active,
  onClick,
  title,
  subtitle,
  trailing,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  trailing?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors",
        active
          ? "border-brand bg-brand-tint"
          : "border-line bg-paper hover:border-brand hover:bg-brand-tint",
      ].join(" ")}
    >
      <span>
        <span className="block font-display text-lg font-semibold uppercase tracking-wide text-ink">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>
        )}
      </span>
      {trailing && (
        <span className="ml-3 shrink-0 rounded-full bg-brand px-3 py-1 font-mono text-xs font-medium text-white">
          {trailing}
        </span>
      )}
    </button>
  );
}

function SlotGrid({
  slots,
  loading,
  selectedMin,
  onSelect,
  onBackToDate,
}: {
  slots: Slot[];
  loading: boolean;
  selectedMin: number | null;
  onSelect: (s: Slot) => void;
  onBackToDate: () => void;
}) {
  if (loading) {
    return (
      <p className="py-10 text-center text-muted">Cargando horarios…</p>
    );
  }

  const anyAvailable = slots.some((s) => s.available);

  if (slots.length === 0 || !anyAvailable) {
    return (
      <div className="rounded-2xl border border-line bg-line/30 px-5 py-8 text-center">
        <p className="text-ink">No hay horarios disponibles para este día.</p>
        <button
          type="button"
          onClick={onBackToDate}
          className="mt-3 text-sm font-medium text-brand hover:text-brand-deep"
        >
          Elegir otro día
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-brand bg-brand-tint" />
          Disponible
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-line bg-line/60" />
          Espacio no disponible
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {slots.map((s) => {
          const selected = selectedMin === s.startMin;
          if (!s.available) {
            return (
              <div
                key={s.startMin}
                aria-label={`${s.label} — Espacio no disponible`}
                className="flex flex-col items-center rounded-xl border border-line bg-line/40 px-2 py-2.5 text-muted/70"
              >
                <span className="font-mono text-sm line-through">
                  {s.label}
                </span>
                <span className="text-[10px] uppercase tracking-wide">
                  No disponible
                </span>
              </div>
            );
          }
          return (
            <button
              key={s.startMin}
              type="button"
              onClick={() => onSelect(s)}
              className={[
                "flex flex-col items-center rounded-xl border px-2 py-2.5 transition-colors",
                selected
                  ? "border-brand bg-brand text-white"
                  : "border-brand/60 bg-brand-tint text-brand hover:bg-brand hover:text-white",
              ].join(" ")}
            >
              <span className="font-mono text-base font-medium">{s.label}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-80">
                Libre
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TicketSummary({
  barberName,
  dateStr,
  service,
  timeLabel,
}: {
  barberName: string;
  dateStr: string;
  service: ServiceType;
  timeLabel: string;
}) {
  const svc = getService(service);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="pole absolute inset-y-0 left-0 w-2" aria-hidden />
      <dl className="grid grid-cols-2 gap-y-3 px-6 py-5 pl-7">
        <SummaryItem label="Barbero" value={barberName} />
        <SummaryItem label="Servicio" value={svc.label} />
        <SummaryItem label="Día" value={longDateLabel(dateStr)} />
        <SummaryItem
          label="Hora"
          value={`${timeLabel} · ${svc.durationMin} min`}
          mono
        />
        <SummaryItem label="Precio" value={formatCRC(svc.priceCRC)} mono />
      </dl>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd
        className={[
          "mt-0.5 text-sm font-medium text-ink",
          mono ? "font-mono" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-brand"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-brand"
      />
    </label>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-brand/30 bg-brand-tint px-4 py-3 text-sm text-brand-deep">
      {children}
    </p>
  );
}

function SuccessScreen({
  data,
  onAgain,
}: {
  data: Confirmation;
  onAgain: () => void;
}) {
  const svc = getService(data.service);
  const [showPrompt, setShowPrompt] = useState(true);
  const [added, setAdded] = useState(false);

  function addToCalendar() {
    const ics = buildAppointmentICS({
      id: data.id,
      service: data.service,
      barberName: data.barberName,
      clientName: data.name,
      start: data.start,
      end: data.end,
    });
    downloadICS(ics, "cita-jordy-barber.ics");
    setAdded(true);
    setShowPrompt(false);
  }

  return (
    <main className="flex-1 grid place-items-center px-5 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand text-white">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>

        <h1 className="mt-5 font-display text-3xl font-bold uppercase tracking-tight text-ink">
          ¡Cita confirmada!
        </h1>
        <p className="mt-2 text-muted">
          Te esperamos, {data.name.split(" ")[0]}.
        </p>

        <div className="relative mt-7 overflow-hidden rounded-2xl border border-line bg-paper text-left">
          <div className="pole absolute inset-y-0 left-0 w-2" aria-hidden />
          <dl className="grid grid-cols-2 gap-y-3 px-6 py-5 pl-7">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                Barbero
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">
                {data.barberName}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                Servicio
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">
                {svc.label}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                Día
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">
                {longDateLabel(data.dateStr)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                Hora
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-medium text-ink">
                {data.timeLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">
                Precio
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-medium text-ink">
                {formatCRC(svc.priceCRC)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => (added ? addToCalendar() : setShowPrompt(true))}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 font-display font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep"
          >
            {added ? "Descargar de nuevo" : "Agregar a mi calendario"}
          </button>
          {added && (
            <p className="-mt-1 text-xs text-muted">
              Abrí el archivo descargado para guardar la cita. Te recordará 2
              horas antes.
            </p>
          )}
          <button
            type="button"
            onClick={onAgain}
            className="inline-flex items-center justify-center rounded-full border border-line px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
          >
            Reservar otra cita
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center py-1 text-sm text-muted transition-colors hover:text-brand"
          >
            Volver al inicio
          </Link>
        </div>
      </div>

      {showPrompt && (
        <CalendarPrompt
          onAdd={addToCalendar}
          onDismiss={() => setShowPrompt(false)}
        />
      )}
    </main>
  );
}

function CalendarPrompt({
  onAdd,
  onDismiss,
}: {
  onAdd: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-5"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl border border-line bg-paper p-6 text-center shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-tint text-brand">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold uppercase tracking-tight text-ink">
          ¿Agregar al calendario?
        </h2>
        <p className="mt-2 text-sm text-muted">
          Guardá la cita en el calendario de tu teléfono. Te recordará{" "}
          <strong className="text-ink">2 horas antes</strong>.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3.5 font-display font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-deep"
          >
            Agregar al calendario
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center justify-center py-2 text-sm font-medium text-muted transition-colors hover:text-brand"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
