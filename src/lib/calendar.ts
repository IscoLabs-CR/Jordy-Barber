import { SHOP_NAME, getService, type ServiceType } from "./booking";

/**
 * Builds an iCalendar (.ics) event for a confirmed appointment, including a
 * 2-hour reminder (VALARM TRIGGER:-PT2H). When the client opens the file, their
 * phone's calendar stores the event and fires the reminder locally — no server
 * push required.
 */
export interface CalendarEvent {
  id: string | null;
  service: ServiceType;
  barberName: string;
  clientName: string;
  start: Date;
  end: Date;
}

/** Date -> iCal UTC stamp, e.g. 2026-07-03T19:20:00.000Z -> 20260703T192000Z */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Escape reserved characters in iCal text values. */
function escICS(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function buildAppointmentICS(ev: CalendarEvent): string {
  const svc = getService(ev.service);
  const uid = `${ev.id ?? Date.now()}@jordybarber`;
  const summary = `Cita en ${SHOP_NAME} — ${svc.label}`;
  const description = `Servicio: ${svc.label}\nBarbero: ${ev.barberName}\nA nombre de: ${ev.clientName}`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jordy Barber//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(ev.end)}`,
    `SUMMARY:${escICS(summary)}`,
    `DESCRIPTION:${escICS(description)}`,
    `LOCATION:${escICS(SHOP_NAME)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio: tu cita es en 2 horas",
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Trigger the phone/browser to open the .ics so it can be saved to a calendar. */
export function downloadICS(ics: string, filename = "cita.ics"): void {
  const uri = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  const a = document.createElement("a");
  a.href = uri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
