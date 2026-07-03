import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Core scheduling logic shared by the client booking wizard and the barber
 * dashboard. All wall-clock reasoning happens in the shop's timezone; absolute
 * instants (Date / timestamptz) are used for storage and overlap checks.
 */

export const SHOP_TZ = "America/Costa_Rica";
export const OPEN_MIN = 8 * 60; // 08:00
export const CLOSE_MIN = 19 * 60; // 19:00 (last 1-hour appointment can start at 18:00 / 6pm)
export const SLOT_STEP_MIN = 30; // grid granularity (30/60/90 are all multiples)

export type ServiceType =
  | "sencillo"
  | "sombreado"
  | "lavado_cejas"
  | "barba"
  | "full";

export interface ServiceInfo {
  id: ServiceType;
  label: string;
  durationMin: number;
  priceCRC: number;
  description: string;
}

export const SERVICES: ServiceInfo[] = [
  {
    id: "sencillo",
    label: "Corte sencillo",
    durationMin: 60,
    priceCRC: 4000,
    description: "Aprox. 1 hora",
  },
  {
    id: "sombreado",
    label: "Corte sombreado",
    durationMin: 60,
    priceCRC: 5000,
    description: "Aprox. 1 hora",
  },
  {
    id: "lavado_cejas",
    label: "Corte + Lavado + Cejas",
    durationMin: 60,
    priceCRC: 5500,
    description: "Aprox. 1 hora",
  },
  {
    id: "barba",
    label: "Corte + Barba",
    durationMin: 60,
    priceCRC: 6000,
    description: "Aprox. 1 hora",
  },
  {
    id: "full",
    label: "Full service",
    durationMin: 90,
    priceCRC: 7500,
    description: "Aprox. 1 hora 30 minutos",
  },
];

export function getService(type: ServiceType): ServiceInfo {
  const s = SERVICES.find((x) => x.id === type);
  if (!s) throw new Error("Servicio no válido");
  return s;
}

/** Format an amount in Costa Rican colones, e.g. 4000 -> "₡4,000". */
export function formatCRC(amount: number): string {
  return `₡${amount.toLocaleString("en-US")}`;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot {
  startMin: number; // minutes from midnight (shop local time)
  label: string; // e.g. "9:00"
  start: Date; // absolute instant (UTC)
  end: Date; // absolute instant (UTC)
  available: boolean;
}

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/** Day of week for a plain YYYY-MM-DD date (0 = Sunday .. 6 = Saturday). */
export function dowFromDateStr(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function isSunday(dateStr: string): boolean {
  return dowFromDateStr(dateStr) === 0;
}

// Days the shop is closed, 0 = Sunday .. 6 = Saturday.
export const CLOSED_DOWS: number[] = [0];

/** True when the shop is closed on that calendar day. */
export function isClosedDay(dateStr: string): boolean {
  return CLOSED_DOWS.includes(dowFromDateStr(dateStr));
}

/** Absolute instant for a shop-local wall-clock time on a given calendar day. */
export function shopInstant(dateStr: string, minutesFromMidnight: number): Date {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");
  return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, SHOP_TZ);
}

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Generate every candidate start on the 30-minute grid where a block of
 * `durationMin` fits inside working hours. A slot is available only if it is in
 * the future and does not overlap any busy interval for that barber — which is
 * exactly what prevents overbooking across the different service durations.
 */
export function generateDaySlots(
  dateStr: string,
  durationMin: number,
  busy: Interval[],
  now: Date = new Date(),
): Slot[] {
  if (isSunday(dateStr)) return [];
  const slots: Slot[] = [];
  for (let m = OPEN_MIN; m + durationMin <= CLOSE_MIN; m += SLOT_STEP_MIN) {
    const start = shopInstant(dateStr, m);
    const end = new Date(start.getTime() + durationMin * 60_000);
    const notPast = start.getTime() > now.getTime();
    const free = !busy.some((b) => overlaps(start, end, b.start, b.end));
    slots.push({
      startMin: m,
      label: minutesToLabel(m),
      start,
      end,
      available: notPast && free,
    });
  }
  return slots;
}

/** Format an instant as HH:mm in the shop timezone (for the barber views). */
export function formatShopTime(d: Date | string): string {
  return formatInTimeZone(new Date(d), SHOP_TZ, "HH:mm");
}

/** Today's date (YYYY-MM-DD) in the shop timezone. */
export function shopToday(): string {
  return formatInTimeZone(new Date(), SHOP_TZ, "yyyy-MM-dd");
}

export const SHOP_NAME = "Jordy Barber";

const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS_FULL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const MONTHS_FULL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function addDaysStr(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Next `count` calendar days (YYYY-MM-DD) starting today, in shop time. */
export function upcomingDates(count: number): string[] {
  const today = shopToday();
  return Array.from({ length: count }, (_, i) => addDaysStr(today, i));
}

export interface DateParts {
  weekdayShort: string;
  weekdayFull: string;
  day: number;
  monthShort: string;
  monthFull: string;
  year: number;
  dow: number;
}

export function dateParts(dateStr: string): DateParts {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return {
    weekdayShort: WEEKDAYS_SHORT[dow],
    weekdayFull: WEEKDAYS_FULL[dow],
    day: d,
    monthShort: MONTHS_SHORT[mo - 1],
    monthFull: MONTHS_FULL[mo - 1],
    year: y,
    dow,
  };
}

export function longDateLabel(dateStr: string): string {
  const p = dateParts(dateStr);
  return `${p.weekdayFull} ${p.day} de ${p.monthFull}`;
}

export interface WeekRange {
  startStr: string; // Monday (YYYY-MM-DD)
  endStr: string; // next Monday, exclusive (YYYY-MM-DD)
  start: Date; // Monday 00:00 in shop time (absolute instant)
  end: Date; // next Monday 00:00 in shop time (absolute instant)
}

/** The Monday–Sunday week (as instants) that contains `today` in shop time. */
export function weekRange(today: string = shopToday()): WeekRange {
  const { dow } = dateParts(today);
  const daysFromMonday = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  const startStr = addDaysStr(today, -daysFromMonday);
  const endStr = addDaysStr(startStr, 7);
  return {
    startStr,
    endStr,
    start: shopInstant(startStr, 0),
    end: shopInstant(endStr, 0),
  };
}

/** Human label for a week, e.g. "Lun 30 jun – Sáb 5 jul". */
export function weekRangeLabel(startStr: string): string {
  const a = dateParts(startStr);
  const b = dateParts(addDaysStr(startStr, 5)); // Saturday
  return `${a.weekdayShort} ${a.day} ${a.monthShort} – ${b.weekdayShort} ${b.day} ${b.monthShort}`;
}
